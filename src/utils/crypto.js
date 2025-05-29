const crypto = require('crypto');
const { promisify } = require('util');

// SHA1 hashing (binary output to match database)
const sha1Hash = (data) => {
    if (!data) throw new Error('Dữ liệu để hash không được rỗng');
    return crypto.createHash('sha1').update(data).digest();
};

// RSA key generation with seed from MK
const generateRSAKeyPairFromMK = async (mk) => {
    try {
        // Tạo seed từ MK bằng SHA256 để đảm bảo độ dài đủ
        const seed = crypto.createHash('sha256').update(mk).digest();
        const prng = crypto.createHash('sha256').update(seed).digest();
        
        // Tạo cặp khóa RSA với seed
        const { publicKey, privateKey } = await promisify(crypto.generateKeyPair)('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            prng: prng, // Dùng seed để tạo khóa cố định
        });
        return { publicKey, privateKey };
    } catch (error) {
        throw new Error('Lỗi khi tạo cặp khóa RSA từ MK: ' + error.message);
    }
};

// RSA encryption
const rsaEncrypt = (data, publicKey) => {
    try {
        if (!data) throw new Error('Dữ liệu để mã hóa không được rỗng');
        if (!publicKey) throw new Error('Public key không được rỗng');
        try {
            crypto.createPublicKey(publicKey);
        } catch (keyError) {
            throw new Error('Public key không đúng định dạng: ' + keyError.message);
        }
        const dataString = data.toString();
        const dataLength = Buffer.byteLength(dataString, 'utf8');
        if (dataLength > 190) {
            throw new Error(`Dữ liệu quá dài để mã hóa RSA. Độ dài: ${dataLength} bytes, tối đa: 190 bytes`);
        }
        return crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256',
            },
            Buffer.from(dataString)
        ).toString('base64');
    } catch (error) {
        console.error('RSA Encrypt Error:', error);
        throw error;
    }
};

// RSA decryption
const rsaDecrypt = (encryptedData, privateKey) => {
    try {
        const encryptedBuffer = Buffer.from(encryptedData, 'base64');
        return crypto.privateDecrypt(
            {
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256',
            },
            encryptedBuffer
        ).toString();
    } catch (error) {
        console.error('RSA Decrypt Error:', error);
        throw error;
    }
};

module.exports = { sha1Hash, generateRSAKeyPairFromMK, rsaEncrypt, rsaDecrypt };
const crypto = require('crypto');
const { promisify } = require('util');

// SHA1 hashing (binary output to match database)
const sha1Hash = (data) => {
    if (!data) throw new Error('Dữ liệu để hash không được rỗng');
    return crypto.createHash('sha1').update(data).digest(); // Binary Buffer
};

// RSA key generation
const generateRSAKeyPair = async () => {
    try {
        const { publicKey, privateKey } = await promisify(crypto.generateKeyPair)('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        return { publicKey, privateKey };
    } catch (error) {
        throw new Error('Lỗi khi tạo cặp khóa RSA: ' + error.message);
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

// RSA decryption (for testing)
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

module.exports = { sha1Hash, generateRSAKeyPair, rsaEncrypt, rsaDecrypt };
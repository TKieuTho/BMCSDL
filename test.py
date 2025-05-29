import hashlib

password = "123456"
hashed = hashlib.sha1(password.encode()).hexdigest()
print(hashed)

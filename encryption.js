// Encryption utilities using Web Crypto API
class EncryptionUtil {
    static async generateKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        const iterations = 100000;

        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    static async encryptClip(content, password) {
        if (!content || typeof content !== 'string') {
            throw new Error('Invalid content');
        }
        if (!password || typeof password !== 'string') {
            throw new Error('Invalid password');
        }

        try {
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const key = await this.generateKey(password, salt);
            
            const encoder = new TextEncoder();
            const encodedContent = encoder.encode(content);
            
            const encryptedContent = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encodedContent
            );
            
            const encryptedArray = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
            encryptedArray.set(salt, 0);
            encryptedArray.set(iv, salt.length);
            encryptedArray.set(new Uint8Array(encryptedContent), salt.length + iv.length);
            
            return btoa(String.fromCharCode(...encryptedArray));
        } catch (error) {
            throw new Error('Encryption failed');
        }
    }

    static async decryptClip(encryptedData, password) {
        if (!encryptedData || typeof encryptedData !== 'string') {
            throw new Error('Invalid encrypted data');
        }
        if (!password || typeof password !== 'string') {
            throw new Error('Invalid password');
        }

        let encryptedArray;
        try {
            encryptedArray = new Uint8Array(atob(encryptedData).split('').map(char => char.charCodeAt(0)));
        } catch (error) {
            throw new Error('Invalid encrypted data format');
        }

        if (encryptedArray.length < 28) {
            throw new Error('Corrupted encrypted data');
        }

        const salt = encryptedArray.slice(0, 16);
        const iv = encryptedArray.slice(16, 28);
        const encryptedContent = encryptedArray.slice(28);

        try {
            const key = await this.generateKey(password, salt);
            const decryptedContent = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedContent
            );
            
            const decoder = new TextDecoder();
            return decoder.decode(decryptedContent);
        } catch (error) {
            if (error.name === 'OperationError') {
                throw new Error('Incorrect password');
            }
            throw new Error('Decryption failed: ' + error.message);
        }
    }
}

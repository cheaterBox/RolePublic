//! Encryption-at-rest for sensitive values (AI API keys, S3 secrets).
//!
//! Strategy:
//! - Master key derived from `ROLETECT_API_TOKEN` via Argon2id with a
//!   random per-install salt stored in `data_dir/master.salt`.
//! - Each encrypted value uses AES-GCM with a fresh random 12-byte nonce.
//! - Stored form: `nonce || ciphertext || tag` (GCM standard output),
//!   base64-encoded for SQLite storage.

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use std::path::Path;
use thiserror::Error;
use zeroize::Zeroize;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("key derivation failed")]
    Kdf,
    #[error("encryption failed")]
    Encrypt,
    #[error("decryption failed")]
    Decrypt,
    #[error("io error")]
    Io(#[from] std::io::Error),
}

/// 32-byte AES-256 master key. Wrapped in Zeroize so it gets scrubbed on drop.
#[derive(Zeroize)]
#[zeroize(drop)]
pub struct MasterKey([u8; 32]);

impl MasterKey {
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

impl std::fmt::Debug for MasterKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "MasterKey(***REDACTED***)")
    }
}

const ARGON2_MEM_KIB: u32 = 64 * 1024;
const ARGON2_TIME_COST: u32 = 3;
const ARGON2_PARALLELISM: u32 = 1;

/// Derive a 32-byte master key from a user-supplied password (the API token)
/// and a salt. Argon2id with parameters suitable for a server-side key.
pub fn derive_master_key(password: &str, salt: &[u8]) -> Result<MasterKey, CryptoError> {
    let params = Params::new(
        ARGON2_MEM_KIB,
        ARGON2_TIME_COST,
        ARGON2_PARALLELISM,
        Some(32),
    )
    .map_err(|_| CryptoError::Kdf)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|_| CryptoError::Kdf)?;
    Ok(MasterKey(out))
}

/// Generate a fresh 16-byte salt.
pub fn generate_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

/// Persist master key setup: load or create salt, derive the master key.
pub fn load_or_create_master(data_dir: &Path, api_token: &str) -> Result<MasterKey, CryptoError> {
    std::fs::create_dir_all(data_dir)?;
    let salt_path = data_dir.join("master.salt");
    let salt = if salt_path.exists() {
        let bytes = std::fs::read(&salt_path)?;
        if bytes.len() != 16 {
            return Err(CryptoError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "salt file has unexpected size",
            )));
        }
        let mut s = [0u8; 16];
        s.copy_from_slice(&bytes);
        s
    } else {
        let s = generate_salt();
        std::fs::write(&salt_path, s)?;
        // Restrict salt file permissions (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&salt_path)?.permissions();
            perms.set_mode(0o600);
            std::fs::set_permissions(&salt_path, perms)?;
        }
        s
    };
    derive_master_key(api_token, &salt)
}

/// Encrypt a plaintext string with AES-GCM. Output is base64(nonce || ct).
pub struct KeyEncryptor<'a> {
    key: &'a MasterKey,
}

impl<'a> KeyEncryptor<'a> {
    pub fn new(key: &'a MasterKey) -> Self {
        Self { key }
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(self.key.as_bytes()));
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ct = cipher
            .encrypt(
                nonce,
                Payload {
                    msg: plaintext.as_bytes(),
                    aad: b"roletect-api-key",
                },
            )
            .map_err(|_| CryptoError::Encrypt)?;
        let mut combined = Vec::with_capacity(12 + ct.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ct);
        Ok(B64.encode(&combined))
    }
}

/// Decrypt a ciphertext produced by `KeyEncryptor::encrypt`.
pub struct KeyDecryptor<'a> {
    key: &'a MasterKey,
}

impl<'a> KeyDecryptor<'a> {
    pub fn new(key: &'a MasterKey) -> Self {
        Self { key }
    }

    pub fn decrypt(&self, ciphertext_b64: &str) -> Result<String, CryptoError> {
        let combined = B64
            .decode(ciphertext_b64)
            .map_err(|_| CryptoError::Decrypt)?;
        if combined.len() < 12 + 16 {
            return Err(CryptoError::Decrypt);
        }
        let (nonce_bytes, ct) = combined.split_at(12);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(self.key.as_bytes()));
        let nonce = Nonce::from_slice(nonce_bytes);
        let pt = cipher
            .decrypt(
                nonce,
                Payload {
                    msg: ct,
                    aad: b"roletect-api-key",
                },
            )
            .map_err(|_| CryptoError::Decrypt)?;
        String::from_utf8(pt).map_err(|_| CryptoError::Decrypt)
    }

    /// Try to decrypt; if it fails, return None. NEVER logs the input.
    pub fn try_decrypt(&self, ciphertext_b64: &str) -> Option<String> {
        if ciphertext_b64.is_empty() {
            return None;
        }
        self.decrypt(ciphertext_b64).ok()
    }
}

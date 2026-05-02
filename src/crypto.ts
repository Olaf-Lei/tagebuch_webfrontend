import CryptoJS from 'crypto-js'

export function decryptDb(encryptedText: string, hexKey: string): ArrayBuffer {
  const decrypted = CryptoJS.AES.decrypt(encryptedText, hexKey)
  const base64 = decrypted.toString(CryptoJS.enc.Base64)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function encryptDb(dbBytes: Uint8Array, hexKey: string): string {
  // Large Uint8Array → btoa via chunk to avoid call stack overflow
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < dbBytes.length; i += chunk) {
    binary += String.fromCharCode(...dbBytes.subarray(i, i + chunk))
  }
  const base64 = btoa(binary)
  const wordArray = CryptoJS.enc.Base64.parse(base64)
  return CryptoJS.AES.encrypt(wordArray, hexKey).toString()
}

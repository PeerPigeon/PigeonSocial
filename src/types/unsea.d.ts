declare module 'unsea' {
  export function encryptMessageWithMeta(message: string, keypair: any): Promise<string>
  export function decryptMessageWithMeta(encryptedData: string, privateKey: string): Promise<string>
  export function generateRandomPair(): Promise<any>
  export function signMessage(message: string, privateKey: string): Promise<string>
  export function verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean>
}

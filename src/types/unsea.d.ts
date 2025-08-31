declare module 'unsea' {
  export function encryptMessageWithMeta(message: string, keypair: any): Promise<string>
  export function decryptMessageWithMeta(encryptedData: string, privateKey: string): Promise<string>
  export function generateRandomPair(): Promise<any>
  export function signMessage(message: string, privateKey: string): Promise<string>
  export function verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean>
  
  // Session storage functions (like Gun's user.recall())
  export function save(keypair: any, alias: string): void
  export function recall(alias: string): any | null
  export function clear(alias?: string | null): void
  
  // Key persistence functions
  export function saveKeys(alias: string, keypair: any, password?: string): Promise<void>
  export function loadKeys(alias: string, password?: string): Promise<any>
  export function clearKeys(alias: string): Promise<void>
}

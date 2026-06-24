export class File {
  constructor(public readonly uri: string) {}

  async base64(): Promise<string> {
    return "";
  }

  async delete(): Promise<void> {}
}

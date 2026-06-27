import { promises as fs } from "node:fs";
import path from "node:path";

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
}

export async function readJsonFile<T>(file: string): Promise<T> {
  const content = await fs.readFile(file, "utf8");
  return JSON.parse(content) as T;
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

export async function writeTextFile(file: string, value: string): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, value, "utf8");
}

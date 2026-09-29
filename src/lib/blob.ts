import { get, head, put } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

/**
 * Tiny storage layer on top of Vercel Blob (private store).
 * Without BLOB_READ_WRITE_TOKEN (local development only) it falls back to ./.data
 */
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL = path.join(process.cwd(), ".data");

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

export async function readBuffer(pathname: string): Promise<Buffer | null> {
  if (!useBlob) {
    try {
      return await fs.readFile(path.join(LOCAL, pathname));
    } catch {
      return null;
    }
  }
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return streamToBuffer(res.stream);
}

export async function writeBuffer(pathname: string, data: Buffer | string, contentType: string): Promise<void> {
  if (!useBlob) {
    const file = path.join(LOCAL, pathname);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return;
  }
  await put(pathname, data, {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType,
    cacheControlMaxAge: 60,
  });
}

export async function exists(pathname: string): Promise<boolean> {
  if (!useBlob) {
    try {
      await fs.access(path.join(LOCAL, pathname));
      return true;
    } catch {
      return false;
    }
  }
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  const buf = await readBuffer(pathname);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJson(pathname: string, data: unknown): Promise<void> {
  await writeBuffer(pathname, JSON.stringify(data), "application/json");
}

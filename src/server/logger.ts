import "server-only";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

// Never let these reach the logs, at any depth.
const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|service[-_]?role|email/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Fields).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1)]),
  );
}

function write(level: Level, msg: string, fields?: Fields) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...(redact(fields) as Fields) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

/** Structured JSON logs. Fields named like secrets/emails are redacted automatically. */
export const log = {
  debug: (msg: string, f?: Fields) => write("debug", msg, f),
  info: (msg: string, f?: Fields) => write("info", msg, f),
  warn: (msg: string, f?: Fields) => write("warn", msg, f),
  error: (msg: string, f?: Fields) => write("error", msg, f),
};

export function errorFields(e: unknown): Fields {
  if (e instanceof Error) return { errName: e.name, errMessage: e.message, errCode: (e as { code?: string }).code };
  return { err: String(e) };
}

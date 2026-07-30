type Fields = Record<string, boolean | number | string | null | undefined>;

function write(
  level: "error" | "info" | "warn",
  message: string,
  fields: Fields = {},
): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  error: (message: string, fields?: Fields) => write("error", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
};

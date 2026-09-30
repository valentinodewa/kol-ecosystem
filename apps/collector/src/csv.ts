export type CsvRecord = Record<string, string>;

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(headerLine: string) {
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, candidate) =>
    countDelimiter(headerLine, candidate) > countDelimiter(headerLine, best) ? candidate : best,
  );
}

function parseRows(content: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === delimiter) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && content[index + 1] === "\n") {
        index += 1;
      }
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (quoted) {
    throw new Error("CSV tidak valid: tanda kutip belum ditutup");
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function parseCsv(content: string): CsvRecord[] {
  const firstLine = content.split(/\r?\n/, 1)[0];
  if (!firstLine) {
    throw new Error("CSV kosong");
  }

  const rows = parseRows(content, detectDelimiter(firstLine));
  const header = rows.shift()?.map(normalizeHeader);
  if (!header?.length) {
    throw new Error("Header CSV tidak ditemukan");
  }

  const duplicateHeaders = header.filter((value, index) => header.indexOf(value) !== index);
  if (duplicateHeaders.length > 0) {
    throw new Error(`Header CSV duplikat: ${duplicateHeaders.join(", ")}`);
  }

  return rows.map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new Error(
        `Jumlah kolom baris ${rowIndex + 2} tidak sesuai header: ${values.length} != ${header.length}`,
      );
    }

    return Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""]));
  });
}

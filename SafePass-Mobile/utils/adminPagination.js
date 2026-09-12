export async function fetchAllAdminPages(fetchPage, recordKey) {
  const first = await fetchPage(1);
  if (!Array.isArray(first?.[recordKey])) {
    throw new Error(`Invalid Admin ${recordKey} response.`);
  }

  const records = [...first[recordKey]];
  const seen = new Set(records.map((record) => String(record._id)));
  const totalPages = Math.max(1, Number(first.totalPages) || 1);

  for (let page = 2; page <= totalPages; page += 1) {
    const response = await fetchPage(page);
    if (!Array.isArray(response?.[recordKey])) {
      throw new Error(`Could not load Admin ${recordKey} page ${page}.`);
    }
    for (const record of response[recordKey]) {
      const id = String(record._id);
      if (!seen.has(id)) {
        seen.add(id);
        records.push(record);
      }
    }
  }

  return { ...first, [recordKey]: records };
}

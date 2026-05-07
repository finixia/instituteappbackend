function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addMonths(ymd: string, months: number) {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}


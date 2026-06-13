"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.todayYmd = todayYmd;
exports.addMonths = addMonths;
function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}
function todayYmd() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addMonths(ymd, months) {
    const [y, m, d] = ymd.split("-").map((v) => Number(v));
    const date = new Date(y, m - 1 + months, d);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

import * as XLSX from 'xlsx';
import fs from 'fs';

const data = [
  { 날짜: '2026-04-01', 사용처: '스타벅스', 카테고리: '식비', 유형: '지출', 금액: 5500 },
  { 날짜: '2026-04-02', 사용처: '교보문고', 카테고리: '도서', 유형: '지출', 금액: 15000 },
  { 날짜: '2026-04-03', 사용처: '네이버페이 포인트 충전', 카테고리: '기타', 유형: '지출', 금액: 50000 },
  { 날짜: '2026-04-04', 사용처: '당근마켓 판매', 카테고리: '기타', 유형: '수입', 금액: 20000 },
  { 날짜: '2026-04-05', 사용처: '맥도날드', 카테고리: '식비', 유형: '지출', 금액: 8500 },
];

const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, '영수증_내역');

XLSX.writeFile(workbook, '샘플_영수증_데이터.xlsx');
console.log('샘플 엑셀 파일이 생성되었습니다.');

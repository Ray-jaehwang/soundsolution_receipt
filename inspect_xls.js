import * as XLSX from 'xlsx';
import fs from 'fs';

try {
  const buf = fs.readFileSync('지출결의서_2026.xls');
  const workbook = XLSX.read(buf);
  
  const worksheet = workbook.Sheets['지출결의서'];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log(`\n--- 지출결의서 상세 데이터 (처음 8라인) ---`);
  rawData.slice(0, 8).forEach((row, i) => {
    console.log(`Row ${i + 1}:`, JSON.stringify(row));
  });
} catch (error) {
  console.error('엑셀 읽기 실패:', error);
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Receipt } from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;

// Convert File to Base64
export const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        resolve((reader.result as string).split(',')[1]);
      } else {
        reject(new Error('File reading resulted in null'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading generative file'));
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

export const OCR_PROMPT = `
        당신은 영수증 데이터 추출 전문가입니다.
        이 영수증 이미지에서 데이터를 추출하여 JSON 형식으로만 완벽하게 응답하세요.

        [사용처(store) 추출 특별 규칙]
        "성명", "대표자" 옆의 한국인 이름은 식당/상호명이 아닙니다. 간판에 적힐법한 가장 큰 식당/상호명을 추출하세요.

        [결제 정보 추출 가이드]
        카드 영수증(매출전표)일 경우 나오는 카드명, 승인번호 등도 상세히 추출하세요.
        모르는 값은 빈 문자열("")로 두세요.

        [상품 내역 추출 규칙]
        영수증에 상품명, 단가, 수량, 금액이 있으면 "items" 배열에 모두 추출하세요.
        단가나 수량이 보이지 않으면 단가=금액, 수량=1로 넣으세요.

        반드시 아래 형식의 순수 JSON 문자열만 출력하세요.

        {
          "date": "YYYY-MM-DD",
          "time": "HH:mm:ss",
          "store": "진짜 상호명",
          "amount": 0,
          "category": "식비",
          "type": "expense",
          "cardName": "KB국민카드 등",
          "cardNumber": "4703-****-****-1234 등",
          "approvalNum": "30066628 등 승인번호",
          "installment": "일시불 등",
          "merchantNum": "12345678 등 가맹점 번호",
          "items": [
            {"name": "상품명", "unitPrice": 단가숫자, "qty": 수량숫자, "amount": 금액숫자}
          ]
        }
      `;

export const runOcr = async (
  files: FileList,
): Promise<{ receipts: Receipt[]; successCount: number; failCount: number; lastError: unknown }> => {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const newReceipts: Receipt[] = [];
  let successCount = 0;
  let failCount = 0;
  let lastError: unknown = null;

  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      const imagePart = await fileToGenerativePart(file);

      const result = await model.generateContent([OCR_PROMPT, imagePart]);
      const responseText = result.response.text().trim();

      let cleanJson = responseText;
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }

      const parsedData = JSON.parse(cleanJson);

      newReceipts.push({
        id: crypto.randomUUID(),
        date: parsedData.date || new Date().toISOString().split('T')[0],
        time: parsedData.time || '',
        store: parsedData.store || '알 수 없는 가게',
        amount: Number(parsedData.amount) || 0,
        category: parsedData.category || '기타',
        type: parsedData.type || 'expense',
        cardName: parsedData.cardName || '',
        cardNumber: parsedData.cardNumber || '',
        approvalNum: parsedData.approvalNum || '',
        installment: parsedData.installment || '일반승인',
        merchantNum: parsedData.merchantNum || '',
        items: Array.isArray(parsedData.items) ? parsedData.items : [],
      });
      successCount++;
    } catch (err: unknown) {
      console.error(`File ${i} OCR Error:`, err);
      lastError = err;
      failCount++;
    }
  }

  return { receipts: newReceipts, successCount, failCount, lastError };
};

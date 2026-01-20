# 営業メール生成API 操作マニュアル

## 目次

1. [はじめに](#はじめに)
2. [基本的な使い方](#基本的な使い方)
3. [実装例](#実装例)
4. [よくあるユースケース](#よくあるユースケース)
5. [トラブルシューティング](#トラブルシューティング)
6. [ベストプラクティス](#ベストプラクティス)

---

## はじめに

営業メール生成APIは、相手企業のWebサイトURLと送信者・受信者情報を指定するだけで、AIが自動的に営業メール文案を生成します。

### 主な機能

- 企業WebサイトのAI解析による情報抽出
- OpenAI GPTによる自然な営業メール文案生成
- カスタマイズ可能なトーン（フォーマル/フレンドリー/カジュアル）
- 添付資料の自動挿入
- 商談日程URL（Calendlyなど）の組み込み
- OpenAI失敗時の自動フォールバック

### API選択ガイド

| エンドポイント              | 用途                 | レスポンス形式             |
| --------------------------- | -------------------- | -------------------------- |
| `/api/ai/sales-copy`        | 一括生成・バッチ処理 | JSON（一括）               |
| `/api/ai/sales-copy/stream` | リアルタイム表示     | Server-Sent Events（逐次） |

---

## 基本的な使い方

### 最小構成のリクエスト

最低限必要な情報は以下の2つです：

1. `sender` オブジェクト（送信者情報）
2. `recipient.homepageUrl`（相手企業のURL）

```bash
curl -X POST http://localhost:3000/api/ai/sales-copy \
  -H "Content-Type: application/json" \
  -d '{
    "sender": {
      "companyName": "株式会社サンプル",
      "fullName": "山田太郎"
    },
    "recipient": {
      "homepageUrl": "https://www.mercari.com"
    }
  }'
```

### 完全版のリクエスト

すべてのフィールドを指定した例：

```bash
curl -X POST http://localhost:3000/api/ai/sales-copy \
  -H "Content-Type: application/json" \
  -d '{
    "sender": {
      "companyName": "株式会社サンプル",
      "department": "営業部",
      "title": "営業マネージャー",
      "fullName": "山田太郎",
      "email": "yamada@sample.co.jp",
      "phone": "03-1234-5678",
      "subject": "業務効率化ツールのご提案",
      "meetingUrl": "https://calendly.com/yamada/30min"
    },
    "recipient": {
      "companyName": "株式会社メルカリ",
      "department": "事業開発部",
      "contactName": "佐藤花子",
      "email": "sato@mercari.com",
      "homepageUrl": "https://www.mercari.com"
    },
    "attachments": [
      {
        "name": "サービス紹介資料.pdf",
        "url": "https://example.com/files/service-intro.pdf"
      },
      {
        "name": "導入事例集.pdf",
        "url": "https://example.com/files/case-studies.pdf"
      }
    ],
    "notes": "特に貴社のCtoCコマース事業における出品者支援ツールとして、弊社のAI文案生成機能が役立つと考えております。",
    "tone": "formal",
    "language": "ja",
    "productContext": {
      "productSnapshot": "AI営業支援ツール「SalesPro」/ セールスプロ / SaaS型営業支援 / AI文案自動生成",
      "productWhy": "営業担当者の工数削減と成約率向上を実現",
      "coreFeatures": "AI文案生成、自動追客、分析ダッシュボード",
      "quantBenefits": "アポ率30%向上、文案作成時間90%削減"
    }
  }'
```

---

## 実装例

### JavaScript（fetch API）

```javascript
async function generateSalesCopy() {
  const response = await fetch("/api/ai/sales-copy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        companyName: "株式会社サンプル",
        fullName: "山田太郎",
        email: "yamada@sample.co.jp",
        phone: "03-1234-5678",
        subject: "業務効率化のご提案",
        meetingUrl: "https://calendly.com/yamada/30min",
      },
      recipient: {
        companyName: "株式会社ターゲット",
        contactName: "佐藤花子",
        homepageUrl: "https://target.co.jp",
      },
      attachments: [
        {
          name: "サービス資料.pdf",
          url: "https://example.com/files/service.pdf",
        },
      ],
      notes: "特に貴社の○○事業に興味があります。",
      tone: "formal",
      language: "ja",
    }),
  });

  const data = await response.json();

  if (data.success) {
    console.log("生成されたメール文案:");
    console.log(data.message);
    console.log(`文字数: ${data.meta.characters}`);
  } else {
    console.error("エラー:", data.message);
  }
}
```

### TypeScript（React + axios）

```typescript
import axios from "axios";
import { useState } from "react";

interface SalesCopyRequest {
  sender: {
    companyName: string;
    fullName: string;
    email?: string;
    phone?: string;
    subject?: string;
    meetingUrl?: string;
  };
  recipient: {
    companyName?: string;
    contactName?: string;
    homepageUrl: string;
  };
  attachments?: Array<{ name: string; url: string }>;
  notes?: string;
  tone?: "friendly" | "formal" | "casual";
  language?: "ja" | "en";
}

interface SalesCopyResponse {
  success: boolean;
  message: string;
  meta?: {
    characters: number;
    sourceUrl: string;
  };
}

export function useSalesCopyGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSalesCopy = async (
    request: SalesCopyRequest,
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await axios.post<SalesCopyResponse>(
        "/api/ai/sales-copy",
        request,
      );

      if (data.success) {
        return data.message;
      } else {
        setError(data.message);
        return null;
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "不明なエラーが発生しました";
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generateSalesCopy, loading, error };
}
```

### ストリーミング版（Server-Sent Events）

```javascript
async function generateSalesCopyStream() {
  const response = await fetch("/api/ai/sales-copy/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        companyName: "株式会社サンプル",
        fullName: "山田太郎",
      },
      recipient: {
        homepageUrl: "https://target.co.jp",
      },
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    result += chunk;

    // リアルタイムで画面に表示
    console.log("受信:", chunk);
    document.getElementById("output").textContent = result;
  }

  console.log("完成:", result);
}
```

### Python（requests）

```python
import requests
import json

def generate_sales_copy():
    url = "http://localhost:3000/api/ai/sales-copy"

    payload = {
        "sender": {
            "companyName": "株式会社サンプル",
            "fullName": "山田太郎",
            "email": "yamada@sample.co.jp",
            "phone": "03-1234-5678",
            "subject": "業務効率化のご提案"
        },
        "recipient": {
            "companyName": "株式会社ターゲット",
            "contactName": "佐藤花子",
            "homepageUrl": "https://target.co.jp"
        },
        "attachments": [
            {
                "name": "サービス資料.pdf",
                "url": "https://example.com/files/service.pdf"
            }
        ],
        "notes": "特に貴社の○○事業に興味があります。",
        "tone": "formal",
        "language": "ja"
    }

    headers = {
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)
    data = response.json()

    if data.get("success"):
        print("生成されたメール文案:")
        print(data["message"])
        print(f"\n文字数: {data['meta']['characters']}")
    else:
        print(f"エラー: {data.get('message')}")

if __name__ == "__main__":
    generate_sales_copy()
```

---

## よくあるユースケース

### 1. シンプルな営業メール生成

```json
{
  "sender": {
    "companyName": "株式会社サンプル",
    "fullName": "山田太郎",
    "email": "yamada@sample.co.jp"
  },
  "recipient": {
    "homepageUrl": "https://target.co.jp"
  },
  "tone": "formal"
}
```

**用途**: 最小限の情報で素早くメール文案を生成

---

### 2. 商談日程URLを含む営業メール

```json
{
  "sender": {
    "companyName": "株式会社サンプル",
    "fullName": "山田太郎",
    "email": "yamada@sample.co.jp",
    "meetingUrl": "https://calendly.com/yamada/30min"
  },
  "recipient": {
    "companyName": "株式会社ターゲット",
    "contactName": "佐藤花子",
    "homepageUrl": "https://target.co.jp"
  },
  "notes": "15分程度のオンライン商談をご希望の場合、上記URLよりご都合の良い日時をお選びください。"
}
```

**用途**: Calendlyなどの日程調整ツールのURLを含めた営業メール生成

**生成される文案例**:

```
よろしければ、以下より
お打合せをご希望の日時をお選びいただけますと幸甚です。
https://calendly.com/yamada/30min
```

---

### 3. 資料添付付き営業メール

```json
{
  "sender": {
    "companyName": "株式会社サンプル",
    "fullName": "山田太郎"
  },
  "recipient": {
    "homepageUrl": "https://target.co.jp"
  },
  "attachments": [
    {
      "name": "サービス紹介資料.pdf",
      "url": "https://example.com/files/service-intro.pdf"
    },
    {
      "name": "料金プラン.pdf",
      "url": "https://example.com/files/pricing.pdf"
    }
  ]
}
```

**用途**: PDFやドキュメントのURLを含めた営業メール生成

**生成される文案例**:

```
━━━━━━━━━━━━━━━
■ 資料
・サービス紹介資料.pdf
  https://example.com/files/service-intro.pdf
・料金プラン.pdf
  https://example.com/files/pricing.pdf
━━━━━━━━━━━━━━━
```

---

### 4. 商品コンテキスト付き高精度生成

```json
{
  "sender": {
    "companyName": "株式会社サンプル",
    "fullName": "山田太郎",
    "email": "yamada@sample.co.jp"
  },
  "recipient": {
    "companyName": "株式会社ターゲット",
    "homepageUrl": "https://target.co.jp"
  },
  "productContext": {
    "productSnapshot": "AI営業支援ツール「SalesPro」",
    "productWhy": "営業担当者の工数削減と成約率向上",
    "targetSegments": "SaaS企業、IT企業、スタートアップ",
    "coreFeatures": "AI文案生成、自動追客、分析ダッシュボード、CRM連携",
    "quantBenefits": "アポ率30%向上、文案作成時間90%削減、月間100時間の工数削減",
    "differentiators": "業界最高精度のAIエンジン、営業特化の学習データ"
  }
}
```

**用途**: 自社製品の詳細情報を含めた高精度な営業メール生成

---

### 5. フレンドリーなトーンでの営業メール

```json
{
  "sender": {
    "companyName": "株式会社サンプル",
    "fullName": "山田太郎"
  },
  "recipient": {
    "companyName": "株式会社ターゲット",
    "contactName": "佐藤花子",
    "homepageUrl": "https://target.co.jp"
  },
  "tone": "friendly",
  "notes": "Twitterで貴社のプロダクトを拝見し、ぜひお話しさせていただきたいと思いました。"
}
```

**用途**: スタートアップや若手向けのカジュアルな営業メール生成

---

### 6. 英語での営業メール生成

```json
{
  "sender": {
    "companyName": "Sample Inc.",
    "fullName": "Taro Yamada",
    "email": "yamada@sample.com"
  },
  "recipient": {
    "companyName": "Target Corp.",
    "homepageUrl": "https://target.com"
  },
  "language": "en",
  "tone": "formal"
}
```

**用途**: 海外企業向けの英語営業メール生成

---

## トラブルシューティング

### エラー: "recipient.homepageUrl は必須です。"

**原因**: `homepageUrl` フィールドが空または未指定

**解決方法**:

```json
{
  "recipient": {
    "homepageUrl": "https://example.com" // 必ず指定
  }
}
```

---

### エラー: "sender が指定されていません。"

**原因**: `sender` オブジェクト自体が未指定

**解決方法**:

```json
{
  "sender": {
    "companyName": "株式会社サンプル",
    "fullName": "山田太郎"
  }
}
```

---

### 生成された文案に `◯◯◯` が含まれている

**原因**: 一部の情報が未入力のため、プレースホルダーがそのまま残っている

**解決方法**: 必要な情報を追加で指定

```json
{
  "sender": {
    "companyName": "株式会社サンプル", // 会社名を指定
    "fullName": "山田太郎" // 氏名を指定
  }
}
```

**補足**: プレースホルダーは自動的にフォールバック値（例: `◯◯◯` → `弊社`）に置き換わりますが、具体的な情報を指定した方が自然な文案になります。

---

### Webクローリングが失敗する

**原因**:

- 指定したURLにアクセスできない
- タイムアウト（8秒以上）
- Jina AI Reader APIの制限

**解決方法**:

1. URLが正しいか確認
2. URLが公開されているか確認（認証が必要なページは不可）
3. 自動的にフォールバックが実行されるため、基本的には問題なし

---

### OpenAI APIがタイムアウトする

**原因**:

- OpenAI APIの遅延
- リクエストが複雑すぎる

**解決方法**:

- 自動的にローカルテンプレートでフォールバック生成されます
- ストリーミング版（`/api/ai/sales-copy/stream`）を使用することで、よりリアルタイムに生成できます

---

## ベストプラクティス

### 1. 必要最小限の情報から始める

最初は `sender.companyName`, `sender.fullName`, `recipient.homepageUrl` のみで試し、必要に応じて情報を追加していきましょう。

```json
{
  "sender": {
    "companyName": "株式会社サンプル",
    "fullName": "山田太郎"
  },
  "recipient": {
    "homepageUrl": "https://target.co.jp"
  }
}
```

---

### 2. 商談日程URLを活用する

Calendlyなどの日程調整ツールのURLを `meetingUrl` に指定することで、相手が簡単に日程を選べるようになります。

```json
{
  "sender": {
    "meetingUrl": "https://calendly.com/your-name/30min"
  }
}
```

---

### 3. 添付資料は具体的な名前を付ける

資料名を具体的にすることで、相手が内容を把握しやすくなります。

**良い例**:

```json
{
  "attachments": [
    { "name": "SalesPro サービス紹介資料.pdf", "url": "..." },
    { "name": "導入事例集（IT企業向け）.pdf", "url": "..." }
  ]
}
```

**悪い例**:

```json
{
  "attachments": [
    { "name": "資料1.pdf", "url": "..." },
    { "name": "資料2.pdf", "url": "..." }
  ]
}
```

---

### 4. notesフィールドで補足情報を追加

AIが自動生成した文案に追加したい情報がある場合は、`notes` フィールドを活用しましょう。

```json
{
  "notes": "先日の展示会でお名刺交換させていただきました。貴社の○○事業に大変興味があり、ご連絡差し上げました。"
}
```

---

### 5. productContextで精度を上げる

自社製品の詳細情報を `productContext` に含めることで、より精緻で説得力のある営業メールが生成されます。

```json
{
  "productContext": {
    "productSnapshot": "製品名と特徴",
    "targetSegments": "ターゲット顧客",
    "quantBenefits": "定量的な導入効果"
  }
}
```

---

### 6. トーンを相手に合わせる

- **formal**: 大企業、役職者向け（デフォルト）
- **friendly**: スタートアップ、同世代向け
- **casual**: 知人、カジュアルな関係

```json
{
  "tone": "friendly" // 相手に応じて変更
}
```

---

### 7. ストリーミング版で体験向上

リアルタイムでメール文案を表示したい場合は、ストリーミング版を使用しましょう。

```javascript
const response = await fetch("/api/ai/sales-copy/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(request),
});
```

---

## まとめ

営業メール生成APIを使えば、相手企業のURLを指定するだけで、AIが自動的に企業情報を分析し、自然で説得力のある営業メール文案を生成できます。

**次のステップ**:

1. 最小構成でAPIをテスト
2. 商談日程URLや添付資料を追加
3. productContextで精度を上げる
4. トーンや言語を調整して最適化

詳しい仕様は [API仕様書](./api-sales-copy-specification.md) をご覧ください。

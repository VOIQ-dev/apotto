# ユニットテスト仕様書

## 1. テスト概要

### 1.1 目的

- コード品質の担保
- リグレッションの防止
- リファクタリングの安全性確保
- ビジネスロジックの正確性検証

### 1.2 対象範囲

- API Routes（Next.js）
- バックエンドロジック（Railway Worker）
- ユーティリティ関数
- データ変換ロジック

### 1.3 テストフレームワーク

- **JavaScript/TypeScript**: Jest / Vitest
- **E2E**: Playwright（既存）
- **Mocking**: MSW (Mock Service Worker)

### 1.4 カバレッジ目標

- **行カバレッジ**: 80%以上
- **分岐カバレッジ**: 75%以上
- **関数カバレッジ**: 85%以上

### 1.5 テストケースの構成

各テストケースは以下の情報を含みます：

| 項目             | 説明                     |
| ---------------- | ------------------------ |
| **対象画面**     | テスト対象の画面名とURL  |
| **機能**         | テスト対象の機能の説明   |
| **テスト内容**   | 何をテストするのか       |
| **期待する動作** | 正常に動作した場合の結果 |

**テストケースID命名規則**:

- `UT-[カテゴリ]-[連番]`: ユニットテスト
  - 例: `UT-AUTH-001`, `UT-PDF-005`

---

## 2. 認証・セッション管理

### 2.1 ログイン機能

#### UT-AUTH-001: 正常系 - 有効な認証情報でログイン成功

| 項目             | 内容                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| **対象画面**     | ログイン画面 (`/login`)                                                  |
| **機能**         | メールアドレスとパスワードでログイン                                     |
| **テスト内容**   | 正しいメールアドレスとパスワードでログインできること                     |
| **期待する動作** | 有効な認証情報を入力すると、ログインに成功してセッションが作成されること |

```typescript
describe("POST /api/auth/login", () => {
  it("should login successfully with valid credentials", async () => {
    // Arrange
    const payload = {
      email: "test@example.com",
      password: "ValidPass123!",
    };

    // Act
    const response = await request(app).post("/api/auth/login").send(payload);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("user");
    expect(response.body.user.email).toBe(payload.email);
    expect(response.headers["set-cookie"]).toBeDefined();
  });
});
```

**期待値**:

- ステータスコード: 200
- レスポンスに user オブジェクト含む
- Cookie にセッショントークン設定

---

#### UT-AUTH-002: 異常系 - 存在しないメールアドレス

| 項目             | 内容                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| **対象画面**     | ログイン画面 (`/login`)                                                     |
| **機能**         | ログイン時のエラーハンドリング                                              |
| **テスト内容**   | 登録されていないメールアドレスでログインできないこと                        |
| **期待する動作** | 存在しないメールアドレスを入力すると、401エラーとエラーメッセージが返ること |

```typescript
it("should return 401 for non-existent email", async () => {
  // Arrange
  const payload = {
    email: "nonexistent@example.com",
    password: "Password123!",
  };

  // Act
  const response = await request(app).post("/api/auth/login").send(payload);

  // Assert
  expect(response.status).toBe(401);
  expect(response.body.error).toContain("認証に失敗");
});
```

**期待値**:

- ステータスコード: 401
- エラーメッセージ: 「認証に失敗しました」

---

#### UT-AUTH-003: 異常系 - パスワード不一致

| 項目             | 内容                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| **対象画面**     | ログイン画面 (`/login`)                                                     |
| **機能**         | ログイン時のエラーハンドリング                                              |
| **テスト内容**   | 間違ったパスワードでログインできないこと                                    |
| **期待する動作** | 正しいメールアドレスでも間違ったパスワードを入力すると、401エラーが返ること |

```typescript
it("should return 401 for incorrect password", async () => {
  // Arrange
  const payload = {
    email: "test@example.com",
    password: "WrongPassword123!",
  };

  // Act
  const response = await request(app).post("/api/auth/login").send(payload);

  // Assert
  expect(response.status).toBe(401);
  expect(response.body.error).toContain("認証に失敗");
});
```

---

#### UT-AUTH-004: 異常系 - 必須パラメータ欠損

| 項目             | 内容                                                          |
| ---------------- | ------------------------------------------------------------- |
| **対象画面**     | ログイン画面 (`/login`)                                       |
| **機能**         | ログイン時のバリデーション                                    |
| **テスト内容**   | 必須項目が欠けている場合にエラーが返ること                    |
| **期待する動作** | メールアドレスを入力せずにログインすると、400エラーが返ること |

```typescript
it("should return 400 for missing email", async () => {
  // Arrange
  const payload = {
    password: "Password123!",
  };

  // Act
  const response = await request(app).post("/api/auth/login").send(payload);

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("メールアドレス");
});
```

---

#### UT-AUTH-005: 異常系 - 不正なメールフォーマット

| 項目             | 内容                                                    |
| ---------------- | ------------------------------------------------------- |
| **対象画面**     | ログイン画面 (`/login`)                                 |
| **機能**         | ログイン時のバリデーション                              |
| **テスト内容**   | 不正な形式のメールアドレスを検証すること                |
| **期待する動作** | メール形式でない文字列を入力すると、400エラーが返ること |

```typescript
it("should return 400 for invalid email format", async () => {
  // Arrange
  const payload = {
    email: "invalid-email-format",
    password: "Password123!",
  };

  // Act
  const response = await request(app).post("/api/auth/login").send(payload);

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("メールアドレスの形式");
});
```

---

### 2.2 ログアウト機能

#### UT-AUTH-006: 正常系 - ログアウト成功

| 項目             | 内容                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| **対象画面**     | 全画面（ヘッダーメニュー）                                           |
| **機能**         | ログアウト                                                           |
| **テスト内容**   | ログアウトしてセッションを破棄できること                             |
| **期待する動作** | ログイン済みのユーザーがログアウトすると、セッションが削除されること |

```typescript
it("should logout successfully", async () => {
  // Arrange
  const token = "valid-session-token";

  // Act
  const response = await request(app)
    .post("/api/auth/logout")
    .set("Cookie", `session=${token}`);

  // Assert
  expect(response.status).toBe(200);
  expect(response.headers["set-cookie"]).toMatch(/session=;/);
});
```

---

#### UT-AUTH-007: 異常系 - 未認証でログアウト

| 項目             | 内容                                                       |
| ---------------- | ---------------------------------------------------------- |
| **対象画面**     | 全画面（ヘッダーメニュー）                                 |
| **機能**         | ログアウト時の認証チェック                                 |
| **テスト内容**   | 未ログイン状態でログアウトAPIを呼ぶとエラーになること      |
| **期待する動作** | セッションなしでログアウトAPIを呼ぶと、401エラーが返ること |

```typescript
it("should return 401 for unauthenticated logout", async () => {
  // Act
  const response = await request(app).post("/api/auth/logout");

  // Assert
  expect(response.status).toBe(401);
});
```

---

## 3. PDF管理

### 3.1 PDFアップロード

#### UT-PDF-001: 正常系 - PDFアップロード成功

| 項目             | 内容                                                                          |
| ---------------- | ----------------------------------------------------------------------------- |
| **対象画面**     | PDF管理画面 (`/pdf-assets`)                                                   |
| **機能**         | PDFファイルのアップロード                                                     |
| **テスト内容**   | PDFファイルを正常にアップロードできること                                     |
| **期待する動作** | PDFファイルを選択してアップロードすると、Storageに保存されてIDとURLが返ること |

```typescript
describe("POST /api/pdf/upload", () => {
  it("should upload PDF successfully", async () => {
    // Arrange
    const file = Buffer.from("mock-pdf-content");
    const token = "valid-session-token";

    // Act
    const response = await request(app)
      .post("/api/pdf/upload")
      .set("Cookie", `session=${token}`)
      .attach("file", file, "test.pdf");

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("id");
    expect(response.body).toHaveProperty("url");
    expect(response.body.originalFilename).toBe("test.pdf");
  });
});
```

**期待値**:

- ステータスコード: 200
- レスポンスに PDF ID, URL含む
- Supabase Storage にアップロード完了

---

#### UT-PDF-002: 異常系 - ファイルサイズ超過

```typescript
it("should return 413 for file size limit exceeded", async () => {
  // Arrange
  const largeFile = Buffer.alloc(20 * 1024 * 1024); // 20MB
  const token = "valid-session-token";

  // Act
  const response = await request(app)
    .post("/api/pdf/upload")
    .set("Cookie", `session=${token}`)
    .attach("file", largeFile, "large.pdf");

  // Assert
  expect(response.status).toBe(413);
  expect(response.body.error).toContain("ファイルサイズ");
});
```

---

#### UT-PDF-003: 異常系 - PDF以外のファイル

```typescript
it("should return 400 for non-PDF file", async () => {
  // Arrange
  const file = Buffer.from("mock-text-content");
  const token = "valid-session-token";

  // Act
  const response = await request(app)
    .post("/api/pdf/upload")
    .set("Cookie", `session=${token}`)
    .attach("file", file, "test.txt");

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("PDF");
});
```

---

#### UT-PDF-004: 異常系 - 未認証でアップロード

```typescript
it("should return 401 for unauthenticated upload", async () => {
  // Arrange
  const file = Buffer.from("mock-pdf-content");

  // Act
  const response = await request(app)
    .post("/api/pdf/upload")
    .attach("file", file, "test.pdf");

  // Assert
  expect(response.status).toBe(401);
});
```

---

### 3.2 PDF一覧取得

#### UT-PDF-005: 正常系 - PDF一覧取得成功

| 項目             | 内容                                                                |
| ---------------- | ------------------------------------------------------------------- |
| **対象画面**     | PDF管理画面 (`/pdf-assets`)                                         |
| **機能**         | アップロード済みPDFの一覧表示                                       |
| **テスト内容**   | アップロードしたPDFの一覧を取得できること                           |
| **期待する動作** | 認証済みユーザーがPDF一覧APIを呼ぶと、自社のPDF一覧が配列で返ること |

```typescript
describe("GET /api/pdf/list", () => {
  it("should return PDF list successfully", async () => {
    // Arrange
    const token = "valid-session-token";

    // Act
    const response = await request(app)
      .get("/api/pdf/list")
      .set("Cookie", `session=${token}`);

    // Assert
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toHaveProperty("id");
    expect(response.body[0]).toHaveProperty("originalFilename");
  });
});
```

---

#### UT-PDF-006: 正常系 - 空のPDF一覧

```typescript
it("should return empty array when no PDFs exist", async () => {
  // Arrange
  const token = "valid-session-token-new-company";

  // Act
  const response = await request(app)
    .get("/api/pdf/list")
    .set("Cookie", `session=${token}`);

  // Assert
  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
});
```

---

### 3.3 PDF削除

#### UT-PDF-007: 正常系 - PDF削除成功

```typescript
describe("DELETE /api/pdf/by-id/[id]", () => {
  it("should delete PDF successfully", async () => {
    // Arrange
    const pdfId = "existing-pdf-id";
    const token = "valid-session-token";

    // Act
    const response = await request(app)
      .delete(`/api/pdf/by-id/${pdfId}`)
      .set("Cookie", `session=${token}`);

    // Assert
    expect(response.status).toBe(200);
  });
});
```

---

#### UT-PDF-008: 異常系 - 存在しないPDFの削除

```typescript
it("should return 404 for non-existent PDF", async () => {
  // Arrange
  const pdfId = "non-existent-id";
  const token = "valid-session-token";

  // Act
  const response = await request(app)
    .delete(`/api/pdf/by-id/${pdfId}`)
    .set("Cookie", `session=${token}`);

  // Assert
  expect(response.status).toBe(404);
});
```

---

#### UT-PDF-009: 異常系 - 他社のPDF削除試行

```typescript
it("should return 403 for unauthorized PDF deletion", async () => {
  // Arrange
  const pdfId = "other-company-pdf-id";
  const token = "valid-session-token";

  // Act
  const response = await request(app)
    .delete(`/api/pdf/by-id/${pdfId}`)
    .set("Cookie", `session=${token}`);

  // Assert
  expect(response.status).toBe(403);
});
```

---

## 4. PDF閲覧・トラッキング

### 4.1 閲覧開始

#### UT-TRACK-001: 正常系 - 初回閲覧開始

| 項目             | 内容                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| **対象画面**     | PDF閲覧画面 (`/pdf/[token]`)                                                    |
| **機能**         | PDF閲覧開始時のトラッキング記録                                                 |
| **テスト内容**   | メールアドレス入力後にPDF閲覧を開始できること                                   |
| **期待する動作** | 閲覧者がメールアドレスを入力すると、初回閲覧として記録され、PDFが表示されること |

```typescript
describe("POST /api/pdf/[token]/open", () => {
  it("should record first view successfully", async () => {
    // Arrange
    const token = "valid-pdf-token";
    const payload = {
      email: "viewer@example.com",
      session_id: "session-123",
    };

    // Act
    const response = await request(app)
      .post(`/api/pdf/${token}/open`)
      .send(payload);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("pdfId");
    expect(response.body.isNewSession).toBe(true);
  });
});
```

---

#### UT-TRACK-002: 正常系 - 同一セッションでの再アクセス

```typescript
it("should not increment open count for same session", async () => {
  // Arrange
  const token = "valid-pdf-token";
  const payload = {
    email: "viewer@example.com",
    session_id: "session-123",
  };

  // 初回アクセス
  await request(app).post(`/api/pdf/${token}/open`).send(payload);

  // Act - 同一セッションで再アクセス
  const response = await request(app)
    .post(`/api/pdf/${token}/open`)
    .send(payload);

  // Assert
  expect(response.status).toBe(200);
  expect(response.body.isNewSession).toBe(false);
});
```

---

#### UT-TRACK-003: 異常系 - 無効なトークン

```typescript
it("should return 404 for invalid token", async () => {
  // Arrange
  const token = "invalid-token";
  const payload = {
    email: "viewer@example.com",
    session_id: "session-123",
  };

  // Act
  const response = await request(app)
    .post(`/api/pdf/${token}/open`)
    .send(payload);

  // Assert
  expect(response.status).toBe(404);
  expect(response.body.error).toContain("見つかりません");
});
```

---

#### UT-TRACK-004: 異常系 - メールアドレス未入力

```typescript
it("should return 400 for missing email", async () => {
  // Arrange
  const token = "valid-pdf-token";
  const payload = {
    session_id: "session-123",
  };

  // Act
  const response = await request(app)
    .post(`/api/pdf/${token}/open`)
    .send(payload);

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("メールアドレス");
});
```

---

### 4.2 閲覧進捗更新

#### UT-TRACK-005: 正常系 - 進捗更新成功

```typescript
describe("POST /api/pdf/[token]/progress", () => {
  it("should update progress successfully", async () => {
    // Arrange
    const token = "valid-pdf-token";
    const payload = {
      email: "viewer@example.com",
      readPercentage: 50,
      elapsedSeconds: 120,
      session_id: "session-123",
    };

    // Act
    const response = await request(app)
      .post(`/api/pdf/${token}/progress`)
      .send(payload);

    // Assert
    expect(response.status).toBe(200);
  });
});
```

---

#### UT-TRACK-006: 正常系 - 累積時間の計算

```typescript
it("should accumulate elapsed time correctly", async () => {
  // Arrange
  const token = "valid-pdf-token";
  const email = "viewer@example.com";
  const sessionId = "session-123";

  // 1回目の更新
  await request(app).post(`/api/pdf/${token}/progress`).send({
    email,
    readPercentage: 30,
    elapsedSeconds: 60,
    session_id: sessionId,
  });

  // Act - 2回目の更新
  const response = await request(app).post(`/api/pdf/${token}/progress`).send({
    email,
    readPercentage: 50,
    elapsedSeconds: 120,
    session_id: sessionId,
  });

  // Assert
  expect(response.status).toBe(200);
  // DB確認: elapsed_seconds_total = 60 (前回差分)
});
```

---

#### UT-TRACK-007: 異常系 - 不正な読了率（範囲外）

```typescript
it("should return 400 for invalid readPercentage", async () => {
  // Arrange
  const token = "valid-pdf-token";
  const payload = {
    email: "viewer@example.com",
    readPercentage: 150, // 不正値
    elapsedSeconds: 120,
    session_id: "session-123",
  };

  // Act
  const response = await request(app)
    .post(`/api/pdf/${token}/progress`)
    .send(payload);

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("読了率");
});
```

---

## 5. AI文言生成

### 5.1 営業文生成

#### UT-AI-001: 正常系 - AI文言生成成功

| 項目             | 内容                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| **対象画面**     | AIカスタム生成画面 (`/ai-custom`)                                               |
| **機能**         | AIによる営業文の自動生成                                                        |
| **テスト内容**   | 企業情報を入力してAI営業文を生成できること                                      |
| **期待する動作** | 企業名・URL等を指定すると、AIが自動で営業文を生成してストリーミング返却すること |

```typescript
describe("POST /api/ai/sales-copy/stream", () => {
  it("should generate sales copy successfully", async () => {
    // Arrange
    const token = "valid-session-token";
    const payload = {
      pdfId: "pdf-123",
      companyName: "テスト株式会社",
      companyUrl: "https://test.co.jp",
      senderName: "山田太郎",
      senderCompany: "送信元株式会社",
    };

    // Act
    const response = await request(app)
      .post("/api/ai/sales-copy/stream")
      .set("Cookie", `session=${token}`)
      .send(payload);

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
  });
});
```

---

#### UT-AI-002: 異常系 - 必須パラメータ欠損

```typescript
it("should return 400 for missing companyName", async () => {
  // Arrange
  const token = "valid-session-token";
  const payload = {
    pdfId: "pdf-123",
    companyUrl: "https://test.co.jp",
  };

  // Act
  const response = await request(app)
    .post("/api/ai/sales-copy/stream")
    .set("Cookie", `session=${token}`)
    .send(payload);

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("企業名");
});
```

---

#### UT-AI-003: 異常系 - OpenAI APIエラー

```typescript
it("should handle OpenAI API error gracefully", async () => {
  // Arrange
  const token = "valid-session-token";
  const payload = {
    pdfId: "pdf-123",
    companyName: "テスト株式会社",
    companyUrl: "https://test.co.jp",
    senderName: "山田太郎",
    senderCompany: "送信元株式会社",
  };

  // Mock OpenAI API エラー
  mockOpenAI.chat.completions.create.mockRejectedValue(
    new Error("API rate limit exceeded"),
  );

  // Act
  const response = await request(app)
    .post("/api/ai/sales-copy/stream")
    .set("Cookie", `session=${token}`)
    .send(payload);

  // Assert
  expect(response.status).toBe(500);
  expect(response.body.error).toContain("生成に失敗");
});
```

---

## 6. フォーム自動送信

### 6.1 単一送信

#### UT-SUBMIT-001: 正常系 - 送信成功

| 項目             | 内容                                                                                |
| ---------------- | ----------------------------------------------------------------------------------- |
| **対象画面**     | AIカスタム生成画面 (`/ai-custom`)                                                   |
| **機能**         | 問い合わせフォームへの自動送信                                                      |
| **テスト内容**   | 企業の問い合わせフォームに自動で情報を入力・送信できること                          |
| **期待する動作** | 企業URL・企業名・メッセージ等を指定すると、自動でフォームを検索して送信完了すること |

```typescript
describe("POST /api/auto-submit", () => {
  it("should submit form successfully", async () => {
    // Arrange
    const token = "valid-session-token";
    const payload = {
      targetUrl: "https://example.com/contact",
      companyName: "テスト株式会社",
      companyUrl: "https://test.co.jp",
      email: "contact@test.co.jp",
      name: "山田太郎",
      message: "お問い合わせ内容",
    };

    // Act
    const response = await request(app)
      .post("/api/auto-submit")
      .set("Cookie", `session=${token}`)
      .send(payload);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

---

#### UT-SUBMIT-002: 正常系 - CAPTCHA検出で送信不可

```typescript
it("should return blocked status for CAPTCHA", async () => {
  // Arrange
  const token = "valid-session-token";
  const payload = {
    targetUrl: "https://example.com/contact-with-captcha",
    companyName: "テスト株式会社",
    email: "contact@test.co.jp",
  };

  // Act
  const response = await request(app)
    .post("/api/auto-submit")
    .set("Cookie", `session=${token}`)
    .send(payload);

  // Assert
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(false);
  expect(response.body.note).toContain("CAPTCHA");
});
```

---

#### UT-SUBMIT-003: 異常系 - 無効なURL

```typescript
it("should return 400 for invalid URL", async () => {
  // Arrange
  const token = "valid-session-token";
  const payload = {
    targetUrl: "invalid-url",
    companyName: "テスト株式会社",
  };

  // Act
  const response = await request(app)
    .post("/api/auto-submit")
    .set("Cookie", `session=${token}`)
    .send(payload);

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("URL");
});
```

---

### 6.2 バッチ送信

#### UT-SUBMIT-004: 正常系 - バッチ送信成功

```typescript
describe("POST /api/auto-submit/batch", () => {
  it("should process batch submission successfully", async () => {
    // Arrange
    const token = "valid-session-token";
    const payload = {
      items: [
        { targetUrl: "https://example1.com/contact", companyName: "企業A" },
        { targetUrl: "https://example2.com/contact", companyName: "企業B" },
      ],
      senderName: "山田太郎",
    };

    // Act
    const response = await request(app)
      .post("/api/auto-submit/batch")
      .set("Cookie", `session=${token}`)
      .send(payload);

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
  });
});
```

---

## 7. リード管理

### 7.1 リード一覧取得

#### UT-LEAD-001: 正常系 - リード一覧取得成功

| 項目             | 内容                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| **対象画面**     | AIカスタム生成画面 (`/ai-custom`)                                         |
| **機能**         | リード情報の一覧表示（AgGrid）                                            |
| **テスト内容**   | CSVインポートしたリード情報を一覧表示できること                           |
| **期待する動作** | 認証済みユーザーがリード一覧APIを呼ぶと、自社のリード情報が配列で返ること |

```typescript
describe("GET /api/leads", () => {
  it("should return leads list successfully", async () => {
    // Arrange
    const token = "valid-session-token";

    // Act
    const response = await request(app)
      .get("/api/leads")
      .set("Cookie", `session=${token}`);

    // Assert
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

---

### 7.2 リード更新

#### UT-LEAD-002: 正常系 - リード更新成功

```typescript
describe("PATCH /api/leads/[id]", () => {
  it("should update lead successfully", async () => {
    // Arrange
    const leadId = "lead-123";
    const token = "valid-session-token";
    const payload = {
      companyName: "更新後企業名",
      sendStatus: "success",
    };

    // Act
    const response = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set("Cookie", `session=${token}`)
      .send(payload);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.companyName).toBe(payload.companyName);
  });
});
```

---

#### UT-LEAD-003: 異常系 - 不正なsendStatus

```typescript
it("should return 400 for invalid sendStatus", async () => {
  // Arrange
  const leadId = "lead-123";
  const token = "valid-session-token";
  const payload = {
    sendStatus: "invalid-status",
  };

  // Act
  const response = await request(app)
    .patch(`/api/leads/${leadId}`)
    .set("Cookie", `session=${token}`)
    .send(payload);

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("sendStatus");
});
```

---

### 7.3 CSVエクスポート

#### UT-LEAD-004: 正常系 - CSVエクスポート成功

```typescript
describe("GET /api/leads/export", () => {
  it("should export leads as CSV successfully", async () => {
    // Arrange
    const token = "valid-session-token";

    // Act
    const response = await request(app)
      .get("/api/leads/export")
      .set("Cookie", `session=${token}`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("attachment");
  });
});
```

---

## 8. ダッシュボード

### 8.1 メトリクス取得

#### UT-DASH-001: 正常系 - メトリクス取得成功

| 項目             | 内容                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| **対象画面**     | データ分析画面 (`/dashboard`)                                                    |
| **機能**         | PDF閲覧状況・インテントスコアの集計表示                                          |
| **テスト内容**   | ダッシュボードのメトリクス（グラフ・表データ）を取得できること                   |
| **期待する動作** | 期間を指定すると、閲覧数・インテントスコア・ホットリード等の集計データが返ること |

```typescript
describe("GET /api/dashboard/metrics", () => {
  it("should return dashboard metrics successfully", async () => {
    // Arrange
    const token = "valid-session-token";

    // Act
    const response = await request(app)
      .get("/api/dashboard/metrics?range_label=7d")
      .set("Cookie", `session=${token}`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("summary");
    expect(response.body).toHaveProperty("intentScores");
    expect(response.body).toHaveProperty("hotLeadRanking");
  });
});
```

---

#### UT-DASH-002: 正常系 - フィルタ適用

```typescript
it("should apply filters correctly", async () => {
  // Arrange
  const token = "valid-session-token";

  // Act
  const response = await request(app)
    .get("/api/dashboard/metrics?range_label=30d&pdf_id=pdf-123")
    .set("Cookie", `session=${token}`);

  // Assert
  expect(response.status).toBe(200);
  expect(response.body.options.pdfs).toBeDefined();
});
```

---

### 8.2 送信統計取得

#### UT-DASH-003: 正常系 - 送信統計取得成功

```typescript
describe("GET /api/dashboard/send-stats", () => {
  it("should return send statistics successfully", async () => {
    // Arrange
    const token = "valid-session-token";

    // Act
    const response = await request(app)
      .get("/api/dashboard/send-stats")
      .set("Cookie", `session=${token}`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success");
    expect(response.body).toHaveProperty("failed");
    expect(response.body).toHaveProperty("blocked");
    expect(response.body).toHaveProperty("pending");
    expect(response.body).toHaveProperty("total");
  });
});
```

---

## 9. メンテナンス

### 9.1 クリーンアップ処理

#### UT-MAINT-001: 正常系 - クリーンアップ成功

| 項目             | 内容                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| **対象画面**     | なし（バックグラウンド処理）                                                |
| **機能**         | 古いデータの自動削除・失効処理                                              |
| **テスト内容**   | 古いデータを正常に削除・失効できること                                      |
| **期待する動作** | APIキーで認証後、古い送信ログ・開封イベント等が削除され、削除件数が返ること |

```typescript
describe("POST /api/maintenance/cleanup", () => {
  it("should cleanup old data successfully", async () => {
    // Arrange
    const apiKey = process.env.MAINTENANCE_API_KEY;

    // Act
    const response = await request(app)
      .post("/api/maintenance/cleanup")
      .set("x-api-key", apiKey);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.deleted).toHaveProperty("unopenedSendLogs");
    expect(response.body.deleted).toHaveProperty("revokedSendLogs");
  });
});
```

---

#### UT-MAINT-002: 異常系 - APIキー未設定

```typescript
it("should return 401 for missing API key", async () => {
  // Act
  const response = await request(app).post("/api/maintenance/cleanup");

  // Assert
  expect(response.status).toBe(401);
  expect(response.body.error).toBe("Unauthorized");
});
```

---

#### UT-MAINT-003: 異常系 - 不正なAPIキー

```typescript
it("should return 401 for invalid API key", async () => {
  // Arrange
  const invalidKey = "invalid-api-key";

  // Act
  const response = await request(app)
    .post("/api/maintenance/cleanup")
    .set("x-api-key", invalidKey);

  // Assert
  expect(response.status).toBe(401);
  expect(response.body.error).toBe("Unauthorized");
});
```

---

## 10. ユーティリティ関数

### 10.1 日時フォーマット

#### UT-UTIL-001: 正常系 - 日時フォーマット成功

```typescript
describe("formatTokyoDay", () => {
  it("should format date to Tokyo timezone correctly", () => {
    // Arrange
    const date = new Date("2026-01-03T12:00:00Z");

    // Act
    const result = formatTokyoDay(date);

    // Assert
    expect(result).toBe("2026-01-03");
  });
});
```

---

### 10.2 パラメータクランプ

#### UT-UTIL-002: 正常系 - 数値クランプ成功

```typescript
describe("clampInt", () => {
  it("should clamp value within range", () => {
    expect(clampInt("10", 0, 100)).toBe(10);
    expect(clampInt("-5", 0, 100)).toBe(0);
    expect(clampInt("150", 0, 100)).toBe(100);
  });

  it("should return min for invalid input", () => {
    expect(clampInt("invalid", 0, 100)).toBe(0);
    expect(clampInt(null, 0, 100)).toBe(0);
  });
});
```

---

## 11. セットアップとモック

### 11.1 テスト環境セットアップ

```typescript
// jest.setup.ts
import { beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { createSupabaseServiceClient } from "@/lib/supabaseServer";

beforeAll(async () => {
  // テストDB接続
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

afterAll(async () => {
  // クリーンアップ
});

beforeEach(async () => {
  // テストデータ投入
  await seedTestData();
});

afterEach(async () => {
  // テストデータクリア
  await clearTestData();
});
```

---

### 11.2 Supabaseモック

```typescript
// __mocks__/supabase.ts
export const mockSupabase = {
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: "123", email: "test@example.com" },
          error: null,
        }),
      }),
    }),
  }),
  auth: {
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
  },
  storage: {
    from: jest.fn().mockReturnValue({
      upload: jest.fn(),
      getPublicUrl: jest.fn(),
    }),
  },
};
```

---

### 11.3 OpenAI モック

```typescript
// __mocks__/openai.ts
export const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "Generated sales copy",
            },
          },
        ],
      }),
    },
  },
};
```

---

## 12. 実行とレポート

### 12.1 テスト実行コマンド

```bash
# 全テスト実行
npm test

# カバレッジ付き実行
npm test -- --coverage

# 特定ファイルのみ実行
npm test -- src/app/api/auth/login/route.test.ts

# Watch モード
npm test -- --watch
```

---

### 12.2 カバレッジレポート

```bash
# HTMLレポート生成
npm test -- --coverage --coverageReporters=html

# レポート閲覧
open coverage/index.html
```

---

## 13. 合格基準

### 13.1 必須条件

- [ ] 全テストケースが pass
- [ ] 行カバレッジ ≥ 80%
- [ ] 分岐カバレッジ ≥ 75%
- [ ] エッジケースのテスト完備
- [ ] モックの適切な使用

### 13.2 推奨条件

- [ ] 関数カバレッジ ≥ 85%
- [ ] テスト実行時間 < 30秒
- [ ] CI/CDパイプライン組み込み

---

## 14. CI/CD統合

### 14.1 GitHub Actions設定例

```yaml
# .github/workflows/test.yml
name: Unit Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
      - run: yarn install
      - run: yarn test --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## 変更履歴

| 日付       | バージョン | 変更内容 | 担当者 |
| ---------- | ---------- | -------- | ------ |
| 2026-01-03 | 1.0        | 初版作成 | -      |

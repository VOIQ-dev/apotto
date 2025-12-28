# コーディング規約

## 目的
- コードの一貫性を保つ
- 可読性・保守性の向上
- バグの早期発見
- チーム開発の効率化

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **状態管理**: React hooks
- **データベース**: Supabase
- **決済**: Stripe
- **AI**: OpenAI API

---

## TypeScript規約

### 型定義

#### 基本原則
- `any` 型の使用は原則禁止
- 型推論を活用するが、パブリックAPIは明示的に型定義
- `interface` よりも `type` を優先（一貫性のため）

```typescript
// ✅ Good
type User = {
  id: string
  email: string
  name: string
  createdAt: Date
}

type UpdateUserParams = {
  name?: string
  email?: string
}

// ❌ Bad
const user: any = { ... }  // any禁止

interface User {  // typeを使用
  id: string
}
```

#### 型ファイルの配置
```
src/types/
  ├── user.ts
  ├── pdf.ts
  ├── billing.ts
  └── index.ts  // 再エクスポート
```

### Null/Undefined処理

```typescript
// ✅ Good - Optional Chaining & Nullish Coalescing
const userName = user?.name ?? 'Guest'
const count = items?.length ?? 0

// ❌ Bad
const userName = user && user.name ? user.name : 'Guest'
```

### 関数の型定義

```typescript
// ✅ Good - 引数と戻り値を明示
async function fetchUser(userId: string): Promise<User | null> {
  // ...
}

type FetchUserFn = (userId: string) => Promise<User | null>

// ❌ Bad - 戻り値が不明確
async function fetchUser(userId: string) {
  // ...
}
```

---

## Next.js規約

### ディレクトリ構造

```
src/
├── app/                    # App Router
│   ├── (auth)/            # Route Group
│   │   ├── login/
│   │   └── register/
│   ├── api/               # API Routes
│   │   ├── auth/
│   │   ├── pdf/
│   │   └── billing/
│   ├── dashboard/
│   └── layout.tsx
├── components/
│   ├── ui/                # 汎用UIコンポーネント
│   ├── landing/           # ランディングページ専用
│   └── [feature]/         # 機能別コンポーネント
├── lib/                   # ユーティリティ・クライアント
│   ├── supabaseClient.ts
│   ├── stripeClient.ts
│   └── utils.ts
├── types/                 # 型定義
└── middleware.ts          # ミドルウェア
```

### Server Component vs Client Component

#### デフォルトはServer Component
```typescript
// ✅ app/dashboard/page.tsx - Server Component
export default async function DashboardPage() {
  const data = await fetchData()  // サーバーで直接データ取得
  return <Dashboard data={data} />
}
```

#### Client Componentは必要な場合のみ
```typescript
// ✅ components/Counter.tsx - 状態を持つ場合
'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

### API Routes

#### ファイル命名
```
src/app/api/
├── auth/
│   ├── login/route.ts       # POST /api/auth/login
│   └── logout/route.ts      # POST /api/auth/logout
├── pdf/
│   ├── upload/route.ts      # POST /api/pdf/upload
│   └── [id]/route.ts        # GET /api/pdf/:id
```

#### レスポンス形式の統一

```typescript
// ✅ Good - 統一されたレスポンス形式
import { NextResponse } from 'next/server'

// 成功レスポンス
export async function GET() {
  const data = await fetchData()
  return NextResponse.json({
    success: true,
    data,
  })
}

// エラーレスポンス
export async function POST() {
  try {
    // ...
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
```

#### エラーハンドリング

```typescript
// ✅ Good - 適切なHTTPステータスコード
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // バリデーションエラー - 400
    if (!body.email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }

    // 認証エラー - 401
    const user = await authenticate(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 権限エラー - 403
    if (!hasPermission(user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    // 成功 - 200/201
    return NextResponse.json({ success: true, data })

  } catch (error) {
    // サーバーエラー - 500
    console.error('API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## React / コンポーネント規約

### コンポーネント命名

```typescript
// ✅ PascalCase
export default function UserProfile() { }
export function LoginForm() { }

// ❌ camelCase, snake_case
export default function userProfile() { }
export function login_form() { }
```

### Props定義

```typescript
// ✅ Good - type定義 + 分割代入
type ButtonProps = {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export function Button({
  label,
  onClick,
  variant = 'primary',
  disabled = false
}: ButtonProps) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>
}

// ❌ Bad - インライン型定義
export function Button(props: { label: string; onClick: () => void }) {
  return <button onClick={props.onClick}>{props.label}</button>
}
```

### Hooks使用ルール

```typescript
// ✅ Good - カスタムフックで再利用性向上
function useUser(userId: string) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUser(userId).then(setUser).finally(() => setLoading(false))
  }, [userId])

  return { user, loading }
}

// コンポーネントで使用
export function UserProfile({ userId }: { userId: string }) {
  const { user, loading } = useUser(userId)

  if (loading) return <div>Loading...</div>
  if (!user) return <div>User not found</div>

  return <div>{user.name}</div>
}
```

### 条件付きレンダリング

```typescript
// ✅ Good - 早期リターン
export function UserProfile({ user }: { user: User | null }) {
  if (!user) return <div>Please login</div>

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}

// ❌ Bad - ネストが深い
export function UserProfile({ user }: { user: User | null }) {
  return (
    <div>
      {user ? (
        <div>
          <h1>{user.name}</h1>
          <p>{user.email}</p>
        </div>
      ) : (
        <div>Please login</div>
      )}
    </div>
  )
}
```

---

## Tailwind CSS規約

### クラス名の順序

Tailwind CSS Prettier Pluginの順序に従う：

1. レイアウト（display, position）
2. サイズ（width, height）
3. スペーシング（margin, padding）
4. 装飾（background, border）
5. テキスト（font, text）

```typescript
// ✅ Good
<div className="flex items-center justify-between w-full px-4 py-2 bg-white border rounded-lg text-sm font-medium">
```

### 動的クラス名

```typescript
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ✅ Good - cn関数を使用
function cn(...inputs: string[]) {
  return twMerge(clsx(inputs))
}

<button className={cn(
  'px-4 py-2 rounded',
  variant === 'primary' && 'bg-blue-500 text-white',
  variant === 'secondary' && 'bg-gray-200 text-gray-800',
  disabled && 'opacity-50 cursor-not-allowed'
)}>
```

---

## データベース / Supabase規約

### クライアント使用

```typescript
// ✅ Server Component - supabaseAdmin使用
import { createClient } from '@/lib/supabaseAdmin'

export default async function ServerPage() {
  const supabase = createClient()
  const { data } = await supabase.from('users').select('*')
}

// ✅ Client Component - supabaseClient使用
'use client'
import { createClient } from '@/lib/supabaseClient'

export default function ClientComponent() {
  const supabase = createClient()
  // ...
}
```

### クエリの書き方

```typescript
// ✅ Good - 型安全・エラーハンドリング
type User = {
  id: string
  email: string
  name: string
}

const { data, error } = await supabase
  .from('users')
  .select('id, email, name')
  .eq('id', userId)
  .single()

if (error) {
  console.error('Database error:', error)
  return null
}

return data as User

// ❌ Bad - エラーハンドリングなし
const { data } = await supabase.from('users').select('*')
return data
```

---

## セキュリティ規約

### 認証・認可

```typescript
// ✅ API Routeでの認証確認
import { verifyAuth } from '@/lib/routeAuth'

export async function GET(request: Request) {
  const user = await verifyAuth(request)

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // 認証済みユーザーの処理
}
```

### 環境変数

```typescript
// ✅ Good - サーバーサイドのみで使用
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// ✅ Good - クライアント公開OK（NEXT_PUBLIC_プレフィックス）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

// ❌ Bad - シークレットキーをクライアントで使用しない
// const secretKey = process.env.SECRET_KEY  // Client Componentで使用禁止
```

### SQLインジェクション対策

```typescript
// ✅ Good - パラメータ化クエリ
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', userEmail)  // 自動エスケープ

// ❌ Bad - 文字列連結（使用禁止）
// const query = `SELECT * FROM users WHERE email = '${userEmail}'`
```

---

## パフォーマンス規約

### 画像最適化

```typescript
// ✅ Good - Next.js Image component使用
import Image from 'next/image'

<Image
  src="/logo.png"
  alt="Logo"
  width={200}
  height={100}
  priority  // LCPの場合
/>

// ❌ Bad - imgタグ直接使用
<img src="/logo.png" alt="Logo" />
```

### 動的インポート

```typescript
// ✅ Good - 重いコンポーネントは遅延ロード
import dynamic from 'next/dynamic'

const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <div>Loading...</div>,
  ssr: false  // クライアントのみ
})
```

---

## エラーハンドリング規約

### try-catch使用

```typescript
// ✅ Good - 適切なエラーハンドリング
try {
  const result = await riskyOperation()
  return { success: true, data: result }
} catch (error) {
  console.error('Operation failed:', error)

  // エラーの型チェック
  if (error instanceof ValidationError) {
    return { success: false, error: error.message }
  }

  return { success: false, error: 'Unexpected error occurred' }
}

// ❌ Bad - エラーを無視
try {
  await riskyOperation()
} catch (error) {
  // 何もしない
}
```

### ログ出力

```typescript
// ✅ Good - 適切なログレベル
console.error('Critical error:', error)  // エラー
console.warn('Deprecated API used')      // 警告
console.log('User logged in:', userId)   // 情報
console.debug('Debug info:', data)       // デバッグ

// 本番環境では console.log/debug を削除するか、ログサービスに送信
```

---

## テスト規約（今後の拡張用）

### テストファイル配置

```
src/
├── components/
│   ├── Button.tsx
│   └── Button.test.tsx
├── lib/
│   ├── utils.ts
│   └── utils.test.ts
```

### 命名規則

```typescript
// ✅ Good
describe('Button component', () => {
  it('should render with label', () => {
    // ...
  })

  it('should call onClick when clicked', () => {
    // ...
  })
})
```

---

## チェックリスト

コード作成時の確認事項：

- [ ] TypeScript型定義は適切か（`any`を使っていないか）
- [ ] Server/Client Componentを適切に使い分けているか
- [ ] エラーハンドリングは実装されているか
- [ ] セキュリティ上の問題はないか（認証、環境変数など）
- [ ] パフォーマンスへの配慮があるか
- [ ] コンポーネントは再利用可能か
- [ ] 命名規則に従っているか
- [ ] ESLintエラーはないか
- [ ] コメントは必要最小限か（コード自体が説明的であることが理想）

---

## 参考リソース

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [React Best Practices](https://react.dev/learn)

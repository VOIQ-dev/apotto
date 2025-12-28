export type ProductContextFieldKey =
  | 'productSnapshot'
  | 'productWhy'
  | 'productHow'
  | 'beforeAfter'
  | 'targetSegments'
  | 'persona'
  | 'fitCriteria'
  | 'coreFeatures'
  | 'subFeatures'
  | 'qualBenefits'
  | 'quantBenefits'
  | 'differentiators'
  | 'winReasons'
  | 'implementation'
  | 'customerEffort';

export type ProductContext = Record<ProductContextFieldKey, string>;

export type ProductContextField = {
  key: ProductContextFieldKey;
  label: string;
  helper?: string;
};

export type ProductContextGroup = {
  id: string;
  title: string;
  description?: string;
  fields: ProductContextField[];
};

export const PRODUCT_CONTEXT_GROUPS: ProductContextGroup[] = [
  {
    id: 'product_overview',
    title: '商品の全体像（What / Why / How）',
    description: '商品理解を深め、どこが独自性なのかを明確にしてください。',
    fields: [
      {
        key: 'productSnapshot',
        label: '商品名・ジャンル・一言特徴',
        helper: '商品名 / 読み / ジャンル / 一言での特徴を記載',
      },
      {
        key: 'productWhy',
        label: '商品の存在理由・Why',
        helper: 'なぜ生まれたのか・どの課題を解決する思想なのか',
      },
      {
        key: 'productHow',
        label: 'プロダクトアーキテクチャ（How）',
        helper: '仕組み・データ連携・AIロジック・利用者ごとの使い方',
      },
    ],
  },
  {
    id: 'pain_resolution',
    title: '解決できる課題（Before → After）',
    fields: [
      {
        key: 'beforeAfter',
        label: 'Before → After',
        helper: '導入前後の状態を比較して記載',
      },
    ],
  },
  {
    id: 'target_structure',
    title: 'ターゲット構造（どんな企業に刺さるか）',
    fields: [
      {
        key: 'targetSegments',
        label: '主なターゲット',
        helper: '業種 / 規模 / 組織ステージ など',
      },
      {
        key: 'persona',
        label: 'ペルソナ',
        helper: '役職・意思決定構造・各レイヤーの悩み',
      },
      {
        key: 'fitCriteria',
        label: '効果が出やすい会社',
      },
    ],
  },
  {
    id: 'features',
    title: '機能一覧（コア機能・差別化機能・サブ）',
    fields: [
      {
        key: 'coreFeatures',
        label: 'コア機能',
        helper: '価値の源泉となる機能や他社より強い部分',
      },
      {
        key: 'subFeatures',
        label: 'サブ機能',
      },
    ],
  },
  {
    id: 'benefits',
    title: '導入メリット（定性的 / 定量的）',
    fields: [
      {
        key: 'qualBenefits',
        label: '定性的メリット',
        helper: '属人性解消や心理的効果など',
      },
      {
        key: 'quantBenefits',
        label: '定量的メリット',
        helper: 'アポ率UP / 工数削減 / 速度改善など',
      },
    ],
  },
  {
    id: 'differentiators',
    title: '強み・差別化ポイント（競合との違い）',
    fields: [
      {
        key: 'differentiators',
        label: '競合・代替手段との違い',
      },
      {
        key: 'winReasons',
        label: 'なぜこのプロダクトが勝つのか？',
        helper: '深さ・広さ・再現性・AI精度・伴走力など',
      },
    ],
  },
  {
    id: 'implementation',
    title: '導入ステップ・運用フロー',
    fields: [
      {
        key: 'implementation',
        label: '導入の手順',
        helper: '現状ヒアリング → 設計 → 初期設定 → 運用開始 → 改善サイクル → 可視化',
      },
      {
        key: 'customerEffort',
        label: '顧客側の作業量',
        helper: '準備物・任せられる範囲・手離れ感',
      },
    ],
  },
];

export function createEmptyProductContext(): ProductContext {
  return Object.fromEntries(
    (
      [
        'productSnapshot',
        'productWhy',
        'productHow',
        'beforeAfter',
        'targetSegments',
        'persona',
        'fitCriteria',
        'coreFeatures',
        'subFeatures',
        'qualBenefits',
        'quantBenefits',
        'differentiators',
        'winReasons',
        'implementation',
        'customerEffort',
      ] as ProductContextFieldKey[]
    ).map((key) => [key, ''])
  ) as ProductContext;
}

export function sanitizeProductContext(
  context?: Partial<ProductContext>
): ProductContext | undefined {
  if (!context) return undefined;
  const sanitized = createEmptyProductContext();
  let hasValue = false;
  (Object.keys(sanitized) as ProductContextFieldKey[]).forEach((key) => {
    const value = context[key];
    const trimmed =
      typeof value === 'string'
        ? value.trim()
        : value !== undefined && value !== null
        ? String(value).trim()
        : '';
    sanitized[key] = trimmed;
    if (trimmed.length > 0) {
      hasValue = true;
    }
  });
  return hasValue ? sanitized : undefined;
}

export function formatProductContextForPrompt(
  context?: ProductContext
): string {
  if (!context) return '';
  const sections: string[] = [];

  PRODUCT_CONTEXT_GROUPS.forEach((group) => {
    const entries: string[] = [];
    group.fields.forEach((field) => {
      const value = context[field.key]?.trim();
      if (value) {
        entries.push(`- ${field.label}: ${value}`);
      }
    });
    if (entries.length > 0) {
      sections.push(`### ${group.title}\n${entries.join('\n')}`);
    }
  });

  return sections.join('\n\n');
}


'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';
import { read, utils } from 'xlsx';

import { AppSidebar } from '@/components/AppSidebar';
import { simulateAiWorkflow, type AiWorkflowRequest } from '@/lib/workflows';
import {
  PRODUCT_CONTEXT_GROUPS,
  type ProductContext,
  createEmptyProductContext,
} from '@/lib/productContext';

type SenderProfile = {
  companyName: string;
  department: string;
  title: string;
  fullName: string;
  email: string;
  phone: string;
  subject: string;
};

type CompanyCardField =
  | 'companyName'
  | 'contactName'
  | 'department'
  | 'title'
  | 'email'
  | 'homepageUrl'
  | 'notes';

type TrackingLink = {
  pdfId: string;
  token: string;
  url: string;
};

type CompanyCard = {
  id: string;
  companyName: string;
  contactName: string;
  department: string;
  title: string;
  email: string;
  homepageUrl: string;
  notes: string;
  generatedMessage: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
  errorMessage?: string;
  sendEnabled: boolean;
  attachments: Record<string, TrackingLink>;
};

type PdfAsset = {
  id: string;
  name: string;
  size: number;
  uploadedAt: number;
};

type AiUploadState = {
  fileName?: string;
  importedCount: number;
  skippedCount: number;
  error?: string;
  lastImportedAt?: number;
};

type QueueState = {
  pendingIds: string[];
  running: boolean;
  lastProcessed?: string;
  error?: string;
};

const MAX_COMPANY_ROWS = 100;
const MAX_PDF_STORAGE_BYTES = 50 * 1024 * 1024;
const REQUIRED_SENDER_FIELDS: Array<keyof SenderProfile> = [
  'companyName',
  'fullName',
  'email',
  'subject',
];

const PRODUCT_DETAIL_GROUPS = PRODUCT_CONTEXT_GROUPS;

const SENDER_FIELD_LABELS: Record<keyof SenderProfile, string> = {
  companyName: '会社名',
  department: '部署',
  title: '役職',
  fullName: '担当者名',
  email: 'メールアドレス',
  phone: '電話番号',
  subject: '件名',
};


export default function AiCustomPage() {
  const [senderProfile, setSenderProfile] = useState<SenderProfile>(
    createDefaultSenderProfile
  );
  const [cards, setCards] = useState<CompanyCard[]>([]);
  const [uploadState, setUploadState] = useState<AiUploadState>({
    importedCount: 0,
    skippedCount: 0,
  });
  const [pdfAssets, setPdfAssets] = useState<PdfAsset[]>([]);
  const [queueState, setQueueState] = useState<QueueState>({
    pendingIds: [],
    running: false,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [productContext, setProductContext] = useState<ProductContext>(
    createEmptyProductContext
  );
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [autoRunStatus, setAutoRunStatus] = useState<'idle' | 'running' | 'error' | 'done'>('idle');
  const [autoRunMessage, setAutoRunMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const senderMissingFields = useMemo(
    () =>
      REQUIRED_SENDER_FIELDS.filter(
        (field) => senderProfile[field].trim().length === 0
      ),
    [senderProfile]
  );

  const sendableCards = useMemo(
    () => cards.filter((card) => card.sendEnabled),
    [cards]
  );
  const sendableReadyCards = useMemo(
    () => sendableCards.filter((card) => card.status === 'ready'),
    [sendableCards]
  );

  const remainingCapacity = Math.max(0, MAX_COMPANY_ROWS - cards.length);
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

  const enqueueGeneration = useCallback(
    (ids: string[], replace = false) => {
      setQueueState((prev) => ({
        ...prev,
        pendingIds: replace
          ? [...ids]
          : Array.from(new Set([...prev.pendingIds, ...ids])),
      }));
    },
    []
  );

  const clearQueue = useCallback(() => {
    setQueueState((prev) => ({ ...prev, pendingIds: [] }));
  }, []);

  const handleSenderProfileChange = useCallback(
    (field: keyof SenderProfile, value: string) => {
      setSenderProfile((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const handleCardFieldChange = useCallback(
    (cardId: string, field: CompanyCardField, value: string) => {
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId ? { ...card, [field]: value } : card
        )
      );
    },
    []
  );

  const handleMessageChange = useCallback((cardId: string, value: string) => {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        const trimmed = value.trim();
        return {
          ...card,
          generatedMessage: value,
          status: trimmed.length ? 'ready' : 'pending',
        };
      })
    );
  }, []);

  const handleToggleSendEnabled = useCallback((cardId: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId ? { ...card, sendEnabled: !card.sendEnabled } : card
      )
    );
  }, []);

  const handleAttachmentToggle = useCallback(
    (cardId: string, pdfId: string, enabled: boolean) => {
      setCards((prev) =>
        prev.map((card) => {
          if (card.id !== cardId) return card;
          if (enabled) {
            if (card.attachments[pdfId]) {
              return card;
            }
            return {
              ...card,
              attachments: {
                ...card.attachments,
                [pdfId]: buildTrackingLink(cardId, pdfId),
              },
            };
          }
          const nextAttachments = { ...card.attachments };
          delete nextAttachments[pdfId];
          return { ...card, attachments: nextAttachments };
        })
      );
    },
    []
  );

  const handleProductContextChange = useCallback(
    (field: keyof ProductContext, value: string) => {
      setProductContext((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const handlePdfUpload = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    let lastError: string | null = null;

    setPdfAssets((prev) => {
      let totalSize = prev.reduce((sum, asset) => sum + asset.size, 0);
      const next = [...prev];

      Array.from(files).forEach((file) => {
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith('.pdf')) {
          lastError = 'PDFファイル（.pdf）のみアップロードできます。';
          return;
        }
        if (file.size === 0) {
          lastError = `${file.name} は空のファイルです。`;
          return;
        }
        if (totalSize + file.size > MAX_PDF_STORAGE_BYTES) {
          lastError = 'ご利用のPDFストレージ上限（50MB）を超えています。';
          return;
        }

        next.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          uploadedAt: Date.now(),
        });
        totalSize += file.size;
      });

      return next;
    });

    if (lastError) {
      setLogs((prev) => [...prev, `PDFアップロードエラー: ${lastError}`]);
    }
  }, []);

  const handlePdfRemove = useCallback((pdfId: string) => {
    setPdfAssets((prev) => prev.filter((asset) => asset.id !== pdfId));
    setCards((prev) =>
      prev.map((card) => {
        if (!card.attachments[pdfId]) return card;
        const nextAttachments = { ...card.attachments };
        delete nextAttachments[pdfId];
        return { ...card, attachments: nextAttachments };
      })
    );
  }, []);

  const handleManualCardAdd = useCallback(() => {
    setCards((prev) => [...prev, createEmptyCard()]);
  }, []);

  const handleClearCards = useCallback(() => {
    setCards([]);
    setUploadState({
      importedCount: 0,
      skippedCount: 0,
    });
    clearQueue();
    setLogs((prev) => [...prev, 'カードをリセットしました。']);
  }, [clearQueue]);

  const handleGenerateEntry = useCallback(
    async (cardId: string) => {
      const target = cards.find((card) => card.id === cardId);
      if (!target) {
        throw new Error('対象のカードが見つかりませんでした。');
      }

      if (!target.homepageUrl.trim()) {
        const message = 'ホームページURLは必須です。';
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? { ...card, status: 'error', errorMessage: message }
              : card
          )
        );
        throw new Error(message);
      }

      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, status: 'generating', errorMessage: undefined }
            : card
        )
      );

      const baseUrl =
        typeof window !== 'undefined' ? window.location.origin : '';
      const attachments = Object.values(target.attachments).map((link) => ({
        name:
          pdfAssets.find((asset) => asset.id === link.pdfId)?.name ?? '添付資料',
        url: `${baseUrl}${link.url}`,
        token: link.token,
      }));

      const response = await fetch('/api/ai/sales-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: senderProfile,
          recipient: {
            companyName: target.companyName,
            contactName: target.contactName,
            department: target.department,
            title: target.title,
            email: target.email,
            homepageUrl: target.homepageUrl,
          },
          attachments,
          notes: target.notes,
          tone: 'friendly',
          language: 'ja',
          productContext,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        const message =
          (typeof payload?.message === 'string' && payload.message) ||
          'AI生成に失敗しました。';
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? { ...card, status: 'error', errorMessage: message }
              : card
          )
        );
        throw new Error(message);
      }

      const message =
        (typeof payload?.message === 'string' && payload.message.trim()) || '';

      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? {
                ...card,
                generatedMessage: message,
                status: 'ready',
                errorMessage: undefined,
              }
            : card
        )
      );
      setLogs((prev) => [
        ...prev,
        `✅ ${target.companyName || target.contactName || target.homepageUrl} の文面を生成 (${message.length}文字)`,
      ]);
    },
    [cards, pdfAssets, senderProfile, productContext]
  );

  useEffect(() => {
    if (queueState.running) return;
    const nextId = queueState.pendingIds[0];
    if (!nextId) return;

    setQueueState((prev) => ({ ...prev, running: true, error: undefined }));
    void handleGenerateEntry(nextId)
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : String(error ?? '不明なエラー');
        setLogs((prev) => [...prev, `⚠️ ${message}`]);
        setQueueState((prev) => ({ ...prev, error: message }));
      })
      .finally(() => {
        setQueueState((prev) => ({
          ...prev,
          running: false,
          pendingIds: removeFromQueue(prev.pendingIds, nextId),
          lastProcessed: nextId,
        }));
      });
  }, [handleGenerateEntry, queueState.pendingIds, queueState.running]);

  useEffect(() => {
    if (!autoSendEnabled) {
      setAutoRunStatus('idle');
      setAutoRunMessage(null);
    }
  }, [autoSendEnabled]);

  useEffect(() => {
    if (autoRunStatus === 'done') {
      const timer = setTimeout(() => {
        setAutoRunStatus('idle');
        setAutoRunMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [autoRunStatus]);

  const handleQueuePendingCards = useCallback(() => {
    const pendingIds = cards
      .filter((card) => card.status !== 'ready' && card.homepageUrl.trim())
      .map((card) => card.id);
    if (!pendingIds.length) {
      setLogs((prev) => [...prev, '未生成カードがありません。']);
      return;
    }
    enqueueGeneration(pendingIds, true);
    setLogs((prev) => [
      ...prev,
      `🌀 ${pendingIds.length}件を自動生成キューに設定しました。`,
    ]);
  }, [cards, enqueueGeneration]);

  const handleSimulateSend = useCallback(async () => {
    if (!sendableCards.length) {
      setLogs((prev) => [...prev, '送信対象のカードがありません。']);
      return;
    }
    setIsSending(true);
    setLogs((prev) => [...prev, '🚀 一括送信モックを開始しました。']);

    try {
      const payload: AiWorkflowRequest = {
        sender: senderProfile,
        entries: sendableCards.map((card) => ({
          id: card.id,
          homepageUrl: card.homepageUrl,
          recipient: {
            companyName: card.companyName,
            contactName: card.contactName,
            department: card.department,
            title: card.title,
            email: card.email,
            homepageUrl: card.homepageUrl,
          },
          generatedMessage: card.generatedMessage,
          sendEnabled: card.sendEnabled,
          attachmentCount: Object.keys(card.attachments).length,
        })),
      };

      const result = await simulateAiWorkflow(payload);
      setLogs((prev) => [...prev, ...result.logs]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '送信モックに失敗しました。';
      setLogs((prev) => [...prev, `⚠️ ${message}`]);
    } finally {
      setIsSending(false);
    }
  }, [sendableCards, senderProfile]);

  const runAutoWorkflow = useCallback(
    async (cardIds: string[]) => {
      if (!autoSendEnabled || !cardIds.length) return;
      if (autoRunStatus === 'running') return;

      setAutoRunStatus('running');
      setAutoRunMessage('AI生成を開始します...');
      setLogs((prev) => [...prev, '⚡ 自動送信モードを開始しました。']);

      try {
        for (const id of cardIds) {
          const targetCard = cards.find((card) => card.id === id);
          const label = targetCard?.companyName || targetCard?.contactName || id;
          setAutoRunMessage(`AI生成中: ${label}`);
          await handleGenerateEntry(id);
        }

        setAutoRunMessage('フォーム送信中...');
        await handleSimulateSend();

        setAutoRunStatus('done');
        setAutoRunMessage('自動送信が完了しました。');
        setLogs((prev) => [...prev, '✅ 自動送信が完了しました。']);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '自動送信フローでエラーが発生しました。';
        setAutoRunStatus('error');
        setAutoRunMessage(message);
        setLogs((prev) => [...prev, `⚠️ 自動送信エラー: ${message}`]);
      }
    },
    [autoSendEnabled, autoRunStatus, cards, handleGenerateEntry, handleSimulateSend]
  );

  const handleExcelUpload = useCallback(
    async (file: File) => {
      setUploadState((prev) => ({
        ...prev,
        fileName: file.name,
        error: undefined,
      }));

      try {
        const rows = await readSheetRows(file);
        if (rows.length <= 1) {
          throw new Error('データ行が存在しません。');
        }

        const dataRows = rows
          .slice(1)
          .map((row) => row.map((cell) => sanitize(cell)))
          .filter((row) => row.some((cell) => cell.length > 0));

        const withUrl = dataRows.filter((row) => row[4]?.length > 0);
        const truncated = withUrl.slice(0, MAX_COMPANY_ROWS);

        const skippedMissingUrl = dataRows.length - withUrl.length;
        const skippedByLimit = Math.max(withUrl.length - truncated.length, 0);

        const nextCards = truncated.map((row) => ({
          ...createEmptyCard(),
          companyName: deriveCompanyNameFromUrl(row[4] ?? ''),
          contactName: row[0] ?? '',
          department: row[1] ?? '',
          title: row[2] ?? '',
          email: row[3] ?? '',
          homepageUrl: normalizeHomepageUrl(row[4] ?? ''),
        }));

        const newCardIds = nextCards.map((card) => card.id);

        setCards(nextCards);
        enqueueGeneration(newCardIds, true);
        setUploadState({
          fileName: file.name,
          importedCount: nextCards.length,
          skippedCount: skippedMissingUrl + skippedByLimit,
          lastImportedAt: Date.now(),
        });
        setLogs((prev) => [
          ...prev,
          `Excel読み込み: ${nextCards.length}件をカード化し、自動生成を開始しました。`,
        ]);

        if (autoSendEnabled) {
          setTimeout(() => {
            void runAutoWorkflow(newCardIds);
          }, 0);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Excelの読み込みに失敗しました。';
        setUploadState((prev) => ({
          ...prev,
          error: message,
        }));
        setLogs((prev) => [...prev, `Excel読み込みエラー: ${message}`]);
      }
    },
    [autoSendEnabled, enqueueGeneration, runAutoWorkflow]
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleExcelUpload(file);
      }
      event.target.value = '';
    },
    [handleExcelUpload]
  );

  const handlePdfInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      handlePdfUpload(files);
      event.target.value = '';
    },
    [handlePdfUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        void handleExcelUpload(file);
      }
    },
    [handleExcelUpload]
  );

  const downloadSampleCsv = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = '/sample/sample.csv';
    link.download = 'sample.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 md:pl-64">
      <AppSidebar />
      
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
        <header className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
            AIカスタム文面生成
          </h1>
            <p className="mt-2 text-base text-muted-foreground max-w-3xl">
              送信者情報とターゲット情報を入力し、AIがコンテキストに沿った最適な文面を自動生成します。
              Excelでの一括取り込みにも対応しています。
          </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="登録カード" value={`${cards.length}社`} />
            <StatCard
              label="送信対象 (ON)"
              value={`${sendableCards.length}社`}
              helper="右上のチェックで切替"
            />
            <StatCard
              label="送信準備OK"
              value={`${sendableReadyCards.length}社`}
              helper="チェックON & 生成済み"
            />
          </div>
        </header>

        <section className="card-clean p-8">
          <SectionHeader number="01" title="自社情報（送信者）" />
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <InputField
              label="会社名"
              required
              value={senderProfile.companyName}
              onChange={(value) => handleSenderProfileChange('companyName', value)}
            />
            <InputField
              label="部署"
              value={senderProfile.department}
              onChange={(value) => handleSenderProfileChange('department', value)}
            />
            <InputField
              label="役職"
              value={senderProfile.title}
              onChange={(value) => handleSenderProfileChange('title', value)}
            />
            <InputField
              label="担当者名"
              required
              value={senderProfile.fullName}
              onChange={(value) => handleSenderProfileChange('fullName', value)}
            />
            <InputField
              label="メールアドレス"
              type="email"
              required
              value={senderProfile.email}
              onChange={(value) => handleSenderProfileChange('email', value)}
            />
            <InputField
              label="電話番号"
              value={senderProfile.phone}
              onChange={(value) => handleSenderProfileChange('phone', value)}
            />
            <div className="sm:col-span-2">
          <InputField
                label="件名"
                required
            value={senderProfile.subject}
            onChange={(value) => handleSenderProfileChange('subject', value)}
          />
            </div>
          </div>
          {senderMissingFields.length > 0 && (
            <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              必須項目が不足しています: {' '}
              {senderMissingFields.map((field) => SENDER_FIELD_LABELS[field]).join('、')}
            </div>
          )}
        </section>

        {autoRunStatus !== 'idle' && (
          <div
            className={`card-clean border ${
              autoRunStatus === 'error'
                ? 'border-rose-500/40 bg-rose-500/5'
                : autoRunStatus === 'running'
                ? 'border-primary/40 bg-primary/5'
                : 'border-emerald-400/40 bg-emerald-500/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
                  autoRunStatus === 'error'
                    ? 'bg-rose-500/20 text-rose-300'
                    : autoRunStatus === 'running'
                    ? 'bg-primary/20 text-primary'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {autoRunStatus === 'running' && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {autoRunStatus === 'error' && '⚠️'}
                {autoRunStatus === 'done' && '✅'}
              </span>
            <div>
                <p className="text-sm font-semibold text-foreground">
                  {autoRunStatus === 'running'
                    ? '自動送信フローを実行中'
                    : autoRunStatus === 'error'
                    ? '自動送信フローでエラー'
                    : '自動送信が完了しました'}
              </p>
                <p className="text-xs text-muted-foreground mt-1">{autoRunMessage}</p>
            </div>
          </div>
          </div>
        )}

        <section className="card-clean p-8">
          <SectionHeader
            number="02"
            title="商品理解とターゲット情報"
            description="AIが提案理由や使い方を自然に引用するための追加コンテキストです。"
          />

          <div className="mt-8 flex flex-col gap-6">
            {PRODUCT_DETAIL_GROUPS.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-border bg-muted/30 p-5"
              >
                <h3 className="text-base font-semibold text-foreground mb-1">
                    {group.title}
                  </h3>
                  {group.description && (
                  <p className="text-sm text-muted-foreground mb-4">{group.description}</p>
                  )}
                <div className="grid gap-4 md:grid-cols-2">
                  {group.fields.map((field) => (
                    <TextareaField
                      key={field.key}
                      label={field.label}
                      value={productContext[field.key]}
                      onChange={(value) =>
                        handleProductContextChange(field.key, value)
                      }
                      placeholder={field.helper}
                      rows={4}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card-clean p-8">
          <div className="flex items-center justify-between mb-6">
            <SectionHeader number="03" title="Excel / CSV 取り込み" />
            <button
              type="button"
              onClick={handleManualCardAdd}
              className="btn-secondary text-xs"
            >
              + カードを手動追加
            </button>
          </div>

          <div className="mt-2 mb-6 rounded-lg bg-blue-50/50 border border-blue-100 p-4 text-sm text-blue-700">
            <p className="font-semibold mb-1">フォーマット仕様</p>
            <p>1列目: 担当者名 / 2列目: 部署 / 3列目: 役職 / 4列目: メール / 5列目: ホームページURL（必須）</p>
          </div>

        <div className="mb-6 rounded-xl border border-border bg-muted/20 p-4">
          <label className="flex items-center gap-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              checked={autoSendEnabled}
              onChange={(event) => setAutoSendEnabled(event.target.checked)}
            />
            AI生成後に自動でフォーム送信まで行う
          </label>
          <p className="text-xs text-muted-foreground mt-2">
            チェック時はAI文章生成からフォーム送信までをブラウザ上で連続実行します。処理中にページを閉じると中断されます。
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-xs text-muted-foreground">
            CSV / Excelテンプレートは右のボタンからダウンロードできます。
          </p>
          <button
            type="button"
            onClick={downloadSampleCsv}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 hover:underline"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            サンプルデータをダウンロード
          </button>
        </div>

        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`dropzone group relative flex cursor-pointer flex-col items-center justify-center rounded-xl px-4 py-10 text-center ${
            isDragging ? 'is-active' : ''
          }`}
        >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileInputChange}
              className="sr-only"
            />
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full mb-3 transition-colors ${
              isDragging
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
            }`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-foreground">ファイルを選択またはドロップ</span>
          <span className="mt-1 text-xs text-muted-foreground">
            対応形式: .xlsx / .xls / .csv（最大100行まで）
            </span>

          </label>

          {uploadState.fileName && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{uploadState.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  取り込み: {uploadState.importedCount} / スキップ: {uploadState.skippedCount}
              </p>
            </div>
          {uploadState.error && (
                <span className="text-xs text-rose-500">{uploadState.error}</span>
          )}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleQueuePendingCards}
              className="btn-secondary flex-1"
            >
              未生成カードを再キュー
            </button>
            <button
              type="button"
              onClick={handleClearCards}
              className="btn-secondary flex-1 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
            >
              カードをリセット
            </button>
          </div>
        </section>

        <section className="card-clean p-8">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader number="04" title="PDFライブラリ" />
            <label className="btn-primary cursor-pointer">
              PDFを追加
              <input
                type="file"
                accept=".pdf"
                className="sr-only"
                multiple
                onChange={handlePdfInputChange}
              />
            </label>
          </div>

          {pdfAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg text-center">
              まだPDFが登録されていません。
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-6">
              {pdfAssets.map((pdf) => (
                <div key={pdf.id} className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 flex-shrink-0 rounded bg-rose-100 text-rose-500 flex items-center justify-center">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-1 17v-1h2v1h-2zm0-12v10h2v-10h-2z" fillOpacity="0" /><path d="M7 6h10v12h-10z" fill="none" /><path d="M11.25 2h1.5v1.5h-1.5z" fillOpacity="0" /><path d="M19.5 3h-15c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h15c1.103 0 2-.897 2-2v-14c0-1.103-.897-2-2-2zm-3 14h-9v-10h9v10z" opacity=".5" /><path d="M7 6h10v10h-10z" fillOpacity=".2" /></svg>
                        <span className="text-xs font-bold">PDF</span>
                  </div>
                      <p className="text-sm font-medium text-foreground truncate max-w-[140px]" title={pdf.name}>{pdf.name}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-xs text-muted-foreground">{formatBytes(pdf.size)}</span>
                  <button
                    type="button"
                    onClick={() => handlePdfRemove(pdf.id)}
                      className="text-xs text-rose-500 hover:text-rose-700 hover:underline"
                  >
                    削除
                  </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <SectionHeader number="05" title="企業カード一覧" />
            <p className="text-sm font-medium text-muted-foreground">
              <span className="text-primary font-bold">{sendableReadyCards.length}</span> / {sendableCards.length} 社 OK
            </p>
            </div>

          {cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-12 text-center text-muted-foreground">
              <p>Excelを取り込むか「カードを追加」してください</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {cards.map((card) => (
                <CardItem
                    key={card.id}
                  card={card}
                  pdfAssets={pdfAssets}
                  handleCardFieldChange={handleCardFieldChange}
                  handleToggleSendEnabled={handleToggleSendEnabled}
                  handleAttachmentToggle={handleAttachmentToggle}
                  handleMessageChange={handleMessageChange}
                  handleGenerateEntry={handleGenerateEntry}
                />
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card-clean p-6">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader number="06" title="自動生成キュー" />
              <span className="text-xs font-medium bg-muted px-2 py-1 rounded text-muted-foreground">
                {queueState.pendingIds.length} pending
              </span>
                        </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`font-medium ${queueState.running ? 'text-primary animate-pulse' : 'text-foreground'}`}>
                    {queueState.running ? 'Running...' : 'Idle'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Processed:</span>
                  <span className="text-foreground truncate max-w-[150px]">{queueState.lastProcessed || '-'}</span>
                </div>
                {queueState.error && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-rose-500 text-xs">
                    Error: {queueState.error}
                      </div>
                    )}
              </div>

              <div className="flex gap-3">
                <button onClick={handleQueuePendingCards} className="btn-secondary flex-1 text-xs">
                  リトライ
                </button>
                <button onClick={clearQueue} className="btn-secondary flex-1 text-xs">
                  停止
                </button>
              </div>

              <button
                type="button"
                onClick={handleSimulateSend}
                disabled={isSending || sendableCards.length === 0}
                className="btn-primary w-full mt-2"
              >
                {isSending ? '送信中...' : 'チェック済み企業へ一括送信 (モック)'}
              </button>
            </div>
          </div>

          <div className="card-clean p-6 flex flex-col h-full max-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">実行ログ</h3>
              <button onClick={() => setLogs([])} className="text-xs text-muted-foreground hover:text-foreground">
                クリア
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">ログはありません</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="text-xs p-2 rounded bg-muted/50 text-foreground font-mono break-all">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({ number, title, description }: { number: string; title: string; description?: string }) {
  return (
    <div>
                      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
          {number}
        </span>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground ml-8">{description}</p>
      )}
    </div>
  );
}

function CardItem({
  card,
  pdfAssets,
  handleCardFieldChange,
  handleToggleSendEnabled,
  handleAttachmentToggle,
  handleMessageChange,
  handleGenerateEntry
}: {
  card: CompanyCard;
  pdfAssets: PdfAsset[];
  handleCardFieldChange: (cardId: string, field: CompanyCardField, value: string) => void;
  handleToggleSendEnabled: (cardId: string) => void;
  handleAttachmentToggle: (cardId: string, pdfId: string, enabled: boolean) => void;
  handleMessageChange: (cardId: string, value: string) => void;
  handleGenerateEntry: (cardId: string) => Promise<void>;
}) {
  return (
    <div className={`card-clean p-6 transition-all ${card.status === 'generating' ? 'ring-2 ring-primary/20' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 mb-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${card.sendEnabled ? 'bg-primary border-primary text-white' : 'bg-card border-muted-foreground/40'}`}>
              {card.sendEnabled && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </div>
                        <input
                          type="checkbox"
                          checked={card.sendEnabled}
                          onChange={() => handleToggleSendEnabled(card.id)}
              className="sr-only"
                          disabled={card.status === 'generating'}
            />
            <span className="text-sm font-semibold text-foreground">送信対象</span>
          </label>

          <div className="h-4 w-[1px] bg-border"></div>

          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-md border ${!card.homepageUrl ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-muted border-transparent text-muted-foreground'}`}>
              {card.homepageUrl ? 'URLあり' : 'URLなし'}
                      </span>
                      <StatusBadge status={card.status} />
          </div>
                    </div>

        <button
          type="button"
          onClick={() => void handleGenerateEntry(card.id)}
          disabled={card.status === 'generating'}
          className="btn-secondary text-xs py-1.5 h-8"
        >
          {card.status === 'generating' ? '生成中...' : 'このカードを生成'}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">企業情報</h4>
          <div className="grid gap-3">
                      <InputField
                        label="相手企業名"
                        value={card.companyName}
                        placeholder="例: 株式会社◯◯"
              onChange={(value) => handleCardFieldChange(card.id, 'companyName', value)}
                        disabled={card.status === 'generating'}
                      />
            <div className="grid grid-cols-2 gap-3">
                      <InputField
                        label="担当者名"
                        value={card.contactName}
                        placeholder="例: 山田様"
                onChange={(value) => handleCardFieldChange(card.id, 'contactName', value)}
                        disabled={card.status === 'generating'}
                      />
                      <InputField
                        label="役職"
                        value={card.title}
                        onChange={(value) => handleCardFieldChange(card.id, 'title', value)}
                        disabled={card.status === 'generating'}
                      />
            </div>
                      <InputField
              label="HP URL *"
                        value={card.homepageUrl}
              onChange={(value) => handleCardFieldChange(card.id, 'homepageUrl', normalizeHomepageUrl(value))}
                        disabled={card.status === 'generating'}
                      />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">生成コンテンツ</h4>
          <div className="relative">
            <textarea
              value={card.generatedMessage}
              onChange={(event) => handleMessageChange(card.id, event.target.value)}
              rows={8}
              placeholder="AI生成結果がここに表示されます..."
                        disabled={card.status === 'generating'}
              className="input-clean min-h-[200px] resize-y font-mono text-sm leading-relaxed"
            />
            {card.status === 'generating' && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl">
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-lg border border-border">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-xs font-medium text-foreground">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        </div>
                    </div>

      {/* Attachments */}
                    {pdfAssets.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-3">添付資料を選択</p>
          <div className="flex flex-wrap gap-3">
                          {pdfAssets.map((pdf) => (
              <label key={pdf.id} className="inline-flex items-center gap-2 cursor-pointer select-none p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                              <input
                                type="checkbox"
                                checked={Boolean(card.attachments[pdf.id])}
                  onChange={(event) => handleAttachmentToggle(card.id, pdf.id, event.target.checked)}
                                disabled={card.status === 'generating'}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                <span className="text-sm text-foreground">{pdf.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

      {card.errorMessage && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-lg text-xs text-rose-600">
          {card.errorMessage}
            </div>
          )}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
  disabled,
  required
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`input-clean ${disabled ? 'opacity-60 cursor-not-allowed bg-muted' : ''}`}
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  className,
  helper,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  helper?: string;
  rows?: number;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {helper && (
        <span className="text-xs text-muted-foreground opacity-80">{helper}</span>
      )}
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="input-clean resize-y"
      />
    </label>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="card-clean p-4 flex flex-col justify-between">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: CompanyCard['status'] }) {
  const styles = {
    ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    generating: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
    error: 'bg-rose-50 text-rose-700 border-rose-200',
    pending: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const labels = {
    ready: '完了',
    generating: '生成中',
    error: 'エラー',
    pending: '待機',
  };

  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function createDefaultSenderProfile(): SenderProfile {
  return {
    companyName: '',
    department: '',
    title: '',
    fullName: '',
    email: '',
    phone: '',
    subject: '',
  };
}

function createEmptyCard(): CompanyCard {
  return {
    id: crypto.randomUUID(),
    companyName: '',
    contactName: '',
    department: '',
    title: '',
    email: '',
    homepageUrl: '',
    notes: '',
    generatedMessage: '',
    status: 'pending',
    sendEnabled: true,
    attachments: {},
  };
}

function sanitize(value: unknown): string {
  if (typeof value === 'number') return String(value).trim();
  if (typeof value !== 'string') return '';
  return value.trim();
}

function deriveCompanyNameFromUrl(url: string): string {
  try {
    const parsed = new URL(normalizeHomepageUrl(url));
    return parsed.hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function normalizeHomepageUrl(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function readSheetRows(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('シートが見つかりません。');
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
  }) as string[][];
  return rows;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTrackingLink(cardId: string, pdfId: string): TrackingLink {
  const token = `${cardId}-${pdfId}-${crypto.randomUUID()}`;
  return {
    pdfId,
    token,
    url: `/pdf/${token}`,
  };
}

function removeFromQueue(queue: string[], target: string): string[] {
  const index = queue.indexOf(target);
  if (index === -1) return queue;
  return [...queue.slice(0, index), ...queue.slice(index + 1)];
}

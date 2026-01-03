"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { flushSync } from "react-dom";
import { read, utils } from "xlsx";
import { AgGridReact } from "ag-grid-react";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { Tooltip, Modal, Button } from "@mantine/core";
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  SelectionChangedEvent,
  CellValueChangedEvent,
  RowDragEndEvent,
} from "ag-grid-community";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  colorSchemeDarkBlue,
} from "ag-grid-community";

import { AppSidebar } from "@/components/AppSidebar";

// ag-gridモジュール登録
ModuleRegistry.registerModules([AllCommunityModule]);

// ag-gridテーマ（ライト/ダーク対応）
const agGridThemeLight = themeQuartz;
const agGridThemeDark = themeQuartz.withPart(colorSchemeDarkBlue);
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PRODUCT_CONTEXT_GROUPS,
  type ProductContext,
  createEmptyProductContext,
} from "@/lib/productContext";

type SenderProfile = {
  companyName: string;
  department: string;
  title: string;
  fullName: string;
  lastName: string; // 姓（漢字）
  firstName: string; // 名（漢字）
  lastNameKana: string; // 姓（ふりがな）
  firstNameKana: string; // 名（ふりがな）
  email: string;
  phone: string;
  postalCode: string; // 郵便番号
  prefecture: string; // 都道府県
  city: string; // 市区町村
  address: string; // 住所（番地以降）
  building: string; // 建物名
  subject: string;
  meetingUrl: string; // 商談日程URL（任意）
};

type CompanyCardField =
  | "companyName"
  | "contactName"
  | "department"
  | "title"
  | "email"
  | "homepageUrl"
  | "notes";

type CompanyCard = {
  id: string;
  leadId?: string; // リードIDを保持（送信結果のDB更新に使用）
  companyName: string;
  contactName: string;
  department: string;
  title: string;
  email: string;
  homepageUrl: string;
  notes: string;
  generatedMessage: string;
  status: "pending" | "generating" | "ready" | "error";
  errorMessage?: string;
  sendEnabled: boolean;
};

type SendResultRow = {
  companyName: string;
  homepageUrl: string;
  email: string;
  status: "success" | "failed" | "blocked";
  sentAtIso: string;
};

type LeadRow = {
  id: string;
  companyName: string;
  homepageUrl: string;
  sendStatus: "pending" | "success" | "failed" | "blocked";
  intentScore: number | null;
  isAppointed: boolean;
  isNg: boolean;
  contactName: string;
  department: string;
  title: string;
  email: string;
  importFileName: string;
};

type PdfAsset = {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
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

const REQUIRED_SENDER_FIELDS: Array<keyof SenderProfile> = [
  "companyName",
  "fullName",
  "lastName",
  "firstName",
  "lastNameKana",
  "firstNameKana",
  "email",
  "subject",
  "department",
  "title",
  "phone",
  "postalCode",
  "prefecture",
  "city",
  "address",
];

const PRODUCT_DETAIL_GROUPS = PRODUCT_CONTEXT_GROUPS;
const STORAGE_KEYS = {
  sender: "ai-custom:senderProfile",
  product: "ai-custom:productContext",
} as const;

const SENDER_FIELD_LABELS: Record<keyof SenderProfile, string> = {
  companyName: "会社名",
  department: "部署",
  title: "役職",
  fullName: "担当者名（フルネーム）",
  lastName: "姓（漢字）",
  firstName: "名（漢字）",
  lastNameKana: "姓（ふりがな）",
  firstNameKana: "名（ふりがな）",
  email: "メールアドレス",
  phone: "電話番号",
  postalCode: "郵便番号",
  prefecture: "都道府県",
  city: "市区町村",
  address: "住所（番地以降）",
  building: "建物名（任意）",
  subject: "件名",
  meetingUrl: "商談日程URL（任意）",
};

export default function AiCustomPage() {
  const [senderProfile, setSenderProfile] = useState<SenderProfile>(
    createDefaultSenderProfile,
  );
  const [cards, setCards] = useState<CompanyCard[]>([]);
  const [uploadState, setUploadState] = useState<AiUploadState>({
    importedCount: 0,
    skippedCount: 0,
  });
  const [pdfAssets, setPdfAssets] = useState<PdfAsset[]>([]);
  const [pdfLibraryLoading, setPdfLibraryLoading] = useState(false);
  const [pdfLibraryError, setPdfLibraryError] = useState<string | null>(null);
  const [selectedPdfIds, setSelectedPdfIds] = useState<Record<string, boolean>>(
    {},
  );
  const [queueState, setQueueState] = useState<QueueState>({
    pendingIds: [],
    running: false,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResultRow[]>([]);
  const [lastSendFinishedAt, setLastSendFinishedAt] = useState<string | null>(
    null,
  );
  const [productContext, setProductContext] = useState<ProductContext>(
    createEmptyProductContext,
  );
  const [restoredSender, setRestoredSender] = useState(false);
  const [restoredProduct, setRestoredProduct] = useState(false);
  const [autoRunStatus, setAutoRunStatus] = useState<
    "idle" | "running" | "error" | "done"
  >("idle");
  const [autoRunMessage, setAutoRunMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"error" | "warning" | "success">(
    "error",
  );
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ダークモード検出
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkDarkMode = () => {
      const isDark =
        document.documentElement.classList.contains("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDarkMode(isDark);
    };

    checkDarkMode();

    // MutationObserverでclass変更を監視
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // メディアクエリの変更も監視
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", checkDarkMode);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", checkDarkMode);
    };
  }, []);

  // AgGrid テーマ（ダークモード対応）
  const agGridTheme = useMemo(() => {
    return isDarkMode ? agGridThemeDark : agGridThemeLight;
  }, [isDarkMode]);

  // AgGrid リード管理
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(
    new Set(),
  );
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsTotalPages, setLeadsTotalPages] = useState(1);
  const gridApiRef = useRef<GridApi | null>(null);

  // トースト表示（3秒後に自動消去）
  const showToast = useCallback(
    (message: string, type: "error" | "warning" | "success" = "error") => {
      setToastMessage(message);
      setToastType(type);
      setTimeout(() => setToastMessage(null), 4000);
    },
    [],
  );

  const senderMissingFields = useMemo(
    () =>
      REQUIRED_SENDER_FIELDS.filter(
        (field) => senderProfile[field].trim().length === 0,
      ),
    [senderProfile],
  );

  // 初期ロード: ローカルストレージから入力値を復元
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawSender = localStorage.getItem(STORAGE_KEYS.sender);
      if (rawSender) {
        const parsed = JSON.parse(rawSender) as SenderProfile;
        setSenderProfile((prev) => ({ ...prev, ...parsed }));
        setRestoredSender(true);
      } else {
        setRestoredSender(true);
      }
      const rawProduct = localStorage.getItem(STORAGE_KEYS.product);
      if (rawProduct) {
        const parsed = JSON.parse(rawProduct) as ProductContext;
        setProductContext((prev) => ({ ...prev, ...parsed }));
        setRestoredProduct(true);
      } else {
        setRestoredProduct(true);
      }
    } catch (error) {
      console.warn("[ai-custom] failed to restore from localStorage", error);
      setRestoredSender(true);
      setRestoredProduct(true);
    }
  }, []);

  // 自社情報と商品理解をローカルストレージへ保存
  useEffect(() => {
    if (!restoredSender) return;
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEYS.sender, JSON.stringify(senderProfile));
    } catch (error) {
      console.warn("[ai-custom] failed to persist senderProfile", error);
    }
  }, [senderProfile, restoredSender]);

  useEffect(() => {
    if (!restoredProduct) return;
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEYS.product,
        JSON.stringify(productContext),
      );
    } catch (error) {
      console.warn("[ai-custom] failed to persist productContext", error);
    }
  }, [productContext, restoredProduct]);

  const productContextFilled = useMemo(
    () => Object.values(productContext).some((v) => v.trim().length > 0),
    [productContext],
  );

  const selectedPdfIdList = useMemo(
    () =>
      pdfAssets.filter((pdf) => selectedPdfIds[pdf.id]).map((pdf) => pdf.id),
    [pdfAssets, selectedPdfIds],
  );

  // リード一覧取得
  const fetchLeads = useCallback(
    async (page = 1) => {
      setLeadsLoading(true);
      try {
        const res = await fetch(`/api/leads?page=${page}&limit=100`);
        if (!res.ok) throw new Error("リードの取得に失敗しました");
        const data = await res.json();
        const fetchedLeads: LeadRow[] = (data.leads || []).map(
          (l: Record<string, unknown>) => ({
            id: String(l.id),
            companyName: String(l.company_name ?? ""),
            homepageUrl: String(l.homepage_url ?? ""),
            sendStatus: l.send_status as
              | "pending"
              | "success"
              | "failed"
              | "blocked",
            intentScore: l.intentScore as number | null,
            isAppointed: Boolean(l.is_appointed),
            isNg: Boolean(l.is_ng),
            contactName: String(l.contact_name ?? ""),
            department: String(l.department ?? ""),
            title: String(l.title ?? ""),
            email: String(l.email ?? ""),
            importFileName: String(l.import_file_name ?? ""),
          }),
        );
        setLeads(fetchedLeads);
        setLeadsPage(data.page || 1);
        setLeadsTotalPages(data.totalPages || 1);
      } catch (err) {
        console.error("[fetchLeads]", err);
        showToast("リードの取得に失敗しました", "error");
      } finally {
        setLeadsLoading(false);
      }
    },
    [showToast],
  );

  // 初回リード読み込み
  useEffect(() => {
    void fetchLeads(1);
  }, [fetchLeads]);

  const fetchPdfLibrary = useCallback(async () => {
    setPdfLibraryLoading(true);
    setPdfLibraryError(null);
    try {
      const res = await fetch("/api/pdf/list");
      if (!res.ok) {
        const message = await res
          .text()
          .catch(() => "PDF一覧の取得に失敗しました。");
        throw new Error(message);
      }
      const data = (await res.json().catch(() => ({}))) as {
        pdfs?: Array<{
          id: string;
          filename?: string;
          size_bytes?: number;
          created_at?: string | null;
        }>;
      };
      const next = (data.pdfs ?? []).map((pdf) => ({
        id: String(pdf.id),
        name: String(pdf.filename ?? "PDF"),
        size: Number(pdf.size_bytes ?? 0),
        uploadedAt: String(pdf.created_at ?? ""),
      }));
      setPdfAssets(next);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PDF一覧の取得に失敗しました。";
      setPdfLibraryError(message);
      setPdfAssets([]);
      setLogs((prev) => [...prev, "⚠️ PDF一覧の取得に失敗しました。"]);
    } finally {
      setPdfLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPdfLibrary();
  }, [fetchPdfLibrary]);

  const sendableCards = useMemo(
    () => cards.filter((card) => card.sendEnabled),
    [cards],
  );
  const sendableReadyCards = useMemo(
    () => sendableCards.filter((card) => card.status === "ready"),
    [sendableCards],
  );

  const sendSummary = useMemo(() => {
    const success = sendResults.filter((r) => r.status === "success").length;
    const failed = sendResults.filter(
      (r) => r.status === "failed" || r.status === "blocked",
    ).length;
    return { total: sendResults.length, success, failed };
  }, [sendResults]);

  // AgGrid 列定義
  const leadColumnDefs = useMemo<ColDef<LeadRow>[]>(
    () => [
      {
        width: 50,
        minWidth: 50,
        pinned: "left",
        lockPosition: true,
        suppressMovable: true,
        filter: false,
      },
      {
        field: "importFileName",
        headerName: "インポートファイル",
        editable: false,
        minWidth: 180,
      },
      {
        field: "companyName",
        headerName: "企業名",
        editable: true,
        minWidth: 150,
        flex: 1,
        rowDrag: true,
      },
      {
        field: "homepageUrl",
        headerName: "URL",
        editable: false,
        minWidth: 200,
        flex: 1,
      },
      {
        field: "sendStatus",
        headerName: "送信結果",
        editable: false,
        minWidth: 100,
        cellRenderer: (params: { value: string }) => {
          if (params.value === "success") return "成功";
          if (params.value === "failed") return "失敗";
          if (params.value === "blocked") return "送信不可";
          return "-";
        },
      },
      {
        field: "intentScore",
        headerName: "インテント",
        editable: false,
        minWidth: 100,
        cellRenderer: (params: { value: number | null }) => {
          if (params.value === null) return "-";
          if (params.value >= 90) return "高";
          if (params.value >= 60) return "中";
          if (params.value > 0) return "低";
          return "未開封";
        },
      },
      {
        field: "isAppointed",
        headerName: "アポ獲得",
        editable: true,
        minWidth: 90,
        cellRenderer: "agCheckboxCellRenderer",
        cellEditor: "agCheckboxCellEditor",
      },
      {
        field: "isNg",
        headerName: "NG企業",
        editable: true,
        minWidth: 90,
        cellRenderer: "agCheckboxCellRenderer",
        cellEditor: "agCheckboxCellEditor",
      },
      {
        field: "contactName",
        headerName: "担当者名",
        editable: true,
        minWidth: 120,
      },
      {
        field: "department",
        headerName: "部署名",
        editable: true,
        minWidth: 120,
      },
      {
        field: "title",
        headerName: "役職名",
        editable: true,
        minWidth: 100,
      },
      {
        field: "email",
        headerName: "メールアドレス",
        editable: true,
        minWidth: 180,
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
    }),
    [],
  );

  const onGridReady = useCallback((params: GridReadyEvent) => {
    gridApiRef.current = params.api;
  }, []);

  const onSelectionChanged = useCallback((event: SelectionChangedEvent) => {
    const selectedNodes = event.api.getSelectedNodes();
    const ids = new Set(
      selectedNodes.map((node) => node.data?.id as string).filter(Boolean),
    );
    setSelectedLeadIds(ids);
  }, []);

  const onCellValueChanged = useCallback(
    async (event: CellValueChangedEvent<LeadRow>) => {
      const { data, colDef, newValue } = event;
      if (!data?.id || !colDef.field) return;

      const fieldMap: Record<string, string> = {
        companyName: "companyName",
        contactName: "contactName",
        department: "department",
        title: "title",
        email: "email",
        isAppointed: "isAppointed",
        isNg: "isNg",
      };

      const apiField = fieldMap[colDef.field];
      if (!apiField) return;

      try {
        const res = await fetch(`/api/leads/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [apiField]: newValue }),
        });
        if (!res.ok) throw new Error("更新失敗");
      } catch {
        showToast("更新に失敗しました", "error");
        void fetchLeads(leadsPage);
      }
    },
    [fetchLeads, leadsPage, showToast],
  );

  const onRowDragEnd = useCallback((event: RowDragEndEvent) => {
    // 行順序はDBに保存しないため、フロントエンドのみで反映
    console.debug("[rowDragEnd]", event);
  }, []);

  // リードCSVエクスポート（AgGrid公式API使用 - 全データ出力）
  const handleExportLeadsCsv = useCallback(() => {
    if (!gridApiRef.current) {
      console.warn("Grid API is not ready");
      return;
    }

    gridApiRef.current.exportDataAsCsv({
      fileName: `leads_${new Date().toISOString().slice(0, 10)}.csv`,
      exportedRows: "all", // ページネーション関係なく全データをエクスポート
    });
  }, []);

  const enqueueGeneration = useCallback((ids: string[], replace = false) => {
    setQueueState((prev) => ({
      ...prev,
      pendingIds: replace
        ? [...ids]
        : Array.from(new Set([...prev.pendingIds, ...ids])),
    }));
  }, []);

  const clearQueue = useCallback(() => {
    setQueueState((prev) => ({ ...prev, pendingIds: [] }));
  }, []);

  const pushLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, message]);
  }, []);

  const resetSendResults = useCallback(() => {
    setSendResults([]);
    setLastSendFinishedAt(null);
  }, []);

  const handleSenderProfileChange = useCallback(
    (field: keyof SenderProfile, value: string) => {
      setSenderProfile((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );

  const handleCardFieldChange = useCallback(
    (cardId: string, field: CompanyCardField, value: string) => {
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId ? { ...card, [field]: value } : card,
        ),
      );
    },
    [],
  );

  const handleMessageChange = useCallback((cardId: string, value: string) => {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        const trimmed = value.trim();
        return {
          ...card,
          generatedMessage: value,
          status: trimmed.length ? "ready" : "pending",
        };
      }),
    );
  }, []);

  const handleToggleSendEnabled = useCallback((cardId: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId ? { ...card, sendEnabled: !card.sendEnabled } : card,
      ),
    );
  }, []);

  const handlePdfSelectionToggle = useCallback(
    (pdfId: string, enabled: boolean) => {
      // 1送信につきPDFは1つまで（チェック式だが挙動は単一選択）
      setSelectedPdfIds(() => (enabled ? { [pdfId]: true } : {}));
    },
    [],
  );

  const handleProductContextChange = useCallback(
    (field: keyof ProductContext, value: string) => {
      setProductContext((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );

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
    setLogs((prev) => [...prev, "カードをリセットしました。"]);
  }, [clearQueue]);

  const handleGenerateEntry = useCallback(
    async (cardId: string, snapshot?: CompanyCard) => {
      const target = snapshot ?? cards.find((card) => card.id === cardId);
      if (!target) {
        throw new Error("対象のカードが見つかりませんでした。");
      }

      if (!target.homepageUrl.trim()) {
        const message = "ホームページURLは必須です。";
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? { ...card, status: "error", errorMessage: message }
              : card,
          ),
        );
        throw new Error(message);
      }

      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, status: "generating", errorMessage: undefined }
            : card,
        ),
      );

      const attachments = selectedPdfIdList.map((pdfId, index) => ({
        name: pdfAssets.find((asset) => asset.id === pdfId)?.name ?? "添付資料",
        url: `{{PDF_LINK_${index + 1}}}`,
        token: `PDF_LINK_${index + 1}`,
      }));

      const controller = new AbortController();
      const res = await fetch("/api/ai/sales-copy/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          tone: "friendly",
          language: "ja",
          productContext,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const message = await res.text().catch(() => "AI生成に失敗しました。");
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? { ...card, status: "error", errorMessage: message }
              : card,
          ),
        );
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        const current = accumulated;
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? {
                  ...card,
                  generatedMessage: current,
                  status: "generating",
                  errorMessage: undefined,
                }
              : card,
          ),
        );
      }

      const finalMessage = accumulated.trim();
      if (!finalMessage) {
        const message = "AI生成に失敗しました。";
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? { ...card, status: "error", errorMessage: message }
              : card,
          ),
        );
        throw new Error(message);
      }

      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? {
                ...card,
                generatedMessage: finalMessage,
                status: "ready",
                errorMessage: undefined,
              }
            : card,
        ),
      );
      setLogs((prev) => [
        ...prev,
        `✅ 文面を作成しました: ${target.companyName || target.contactName || target.homepageUrl}`,
      ]);
      return finalMessage;
    },
    [cards, pdfAssets, senderProfile, productContext, selectedPdfIdList],
  );

  useEffect(() => {
    if (queueState.running) return;
    const nextId = queueState.pendingIds[0];
    if (!nextId) return;

    setQueueState((prev) => ({ ...prev, running: true, error: undefined }));
    void handleGenerateEntry(nextId)
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : String(error ?? "不明なエラー");
        console.debug("[ai-custom] generate failed", message);
        setLogs((prev) => [...prev, "⚠️ 文面生成に失敗しました。"]);
        setQueueState((prev) => ({
          ...prev,
          error: "文面生成に失敗しました。",
        }));
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
    if (autoRunStatus === "done") {
      const timer = setTimeout(() => {
        setAutoRunStatus("idle");
        setAutoRunMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [autoRunStatus]);

  const handleQueuePendingCards = useCallback(() => {
    const pendingIds = cards
      .filter((card) => card.status !== "ready" && card.homepageUrl.trim())
      .map((card) => card.id);
    if (!pendingIds.length) {
      setLogs((prev) => [...prev, "未生成カードがありません。"]);
      return;
    }
    enqueueGeneration(pendingIds, true);
    setLogs((prev) => [
      ...prev,
      `🌀 ${pendingIds.length}件を自動生成キューに設定しました。`,
    ]);
  }, [cards, enqueueGeneration]);

  const sendOneCard = useCallback(
    async (card: CompanyCard, origin: string) => {
      const replaceAll = (text: string, from: string, to: string) =>
        text.split(from).join(to);

      const extractSubjectAndBody = (text: string) => {
        const subjectMatch = text.match(/^件名\s*:\s*(.+)$/m);
        const subject =
          subjectMatch?.[1]?.trim() || senderProfile.subject || "";
        const bodyIndex = text.indexOf("本文:");
        const body =
          bodyIndex >= 0
            ? text.slice(bodyIndex + "本文:".length).trim()
            : text.trim();
        return { subject, body };
      };

      const sentAtIso = new Date().toISOString();
      const linkEntries = selectedPdfIdList.map((pdfId, index) => {
        const token = crypto.randomUUID();
        const placeholder = `{{PDF_LINK_${index + 1}}}`;
        const urlPath = `/pdf/${token}`;
        const fullUrl = `${origin}${urlPath}`;
        return { pdfId, token, placeholder, fullUrl };
      });

      // 送信前に生成したURLを一時的にコンソールへ出力（検証用）
      if (linkEntries.length > 0) {
        console.log(
          "[auto-send] generated PDF links",
          linkEntries.map((e) => e.fullUrl),
        );
      }

      let messageWithLinks = card.generatedMessage;
      for (const entry of linkEntries) {
        messageWithLinks = replaceAll(
          messageWithLinks,
          entry.placeholder,
          entry.fullUrl,
        );
      }

      const { subject, body } = extractSubjectAndBody(messageWithLinks);

      const submitRes = await fetch("/api/auto-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: card.homepageUrl,
          company: senderProfile.companyName,
          department: senderProfile.department,
          title: senderProfile.title,
          person: senderProfile.fullName,
          name: senderProfile.fullName,
          lastName: senderProfile.lastName,
          firstName: senderProfile.firstName,
          lastNameKana: senderProfile.lastNameKana,
          firstNameKana: senderProfile.firstNameKana,
          fullNameKana:
            `${senderProfile.lastNameKana} ${senderProfile.firstNameKana}`.trim(),
          email: senderProfile.email,
          phone: senderProfile.phone,
          postalCode: senderProfile.postalCode,
          prefecture: senderProfile.prefecture,
          city: senderProfile.city,
          address: senderProfile.address,
          building: senderProfile.building,
          subject,
          message: body,
          debug: false, // 本番環境ではヘッドレスモード
        }),
      });

      const submitJson = (await submitRes.json().catch(() => ({}))) as {
        success?: boolean;
        logs?: string[];
        note?: string;
      };

      if (!submitRes.ok || !submitJson.success) {
        console.debug("[auto-send] submit failed", {
          url: card.homepageUrl,
          status: submitRes.status,
          note: submitJson.note,
          logs: submitJson.logs,
        });
        return { ok: false, sentAtIso, trackingSaved: false };
      }

      // PDF選択ありの場合のみ、閲覧URLトークンを保存する
      let trackingSaved = true;
      if (linkEntries.length > 0) {
        const sendLogPayload = {
          logs: linkEntries.map((entry) => ({
            pdf_id: entry.pdfId,
            token: entry.token,
            recipient_company_name: card.companyName,
            recipient_homepage_url: card.homepageUrl,
            recipient_email: card.email,
            sent_at: sentAtIso,
          })),
        };

        const saveRes = await fetch("/api/pdf/send-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sendLogPayload),
        });

        if (!saveRes.ok) {
          trackingSaved = false;
          const errText = await saveRes.text().catch(() => "");
          console.warn("[auto-send] failed to save send-log", errText);
        }
      }

      return { ok: true, sentAtIso, trackingSaved };
    },
    [selectedPdfIdList, senderProfile],
  );

  // バッチ送信処理（SSEでリアルタイム更新）
  const handleBatchSend = useCallback(
    async (targets: CompanyCard[], origin: string) => {
      const replaceAll = (text: string, from: string, to: string) =>
        text.split(from).join(to);

      const extractSubjectAndBody = (text: string) => {
        const subjectMatch = text.match(/^件名\s*:\s*(.+)$/m);
        const subject =
          subjectMatch?.[1]?.trim() || senderProfile.subject || "";
        const bodyIndex = text.indexOf("本文:");
        const body =
          bodyIndex >= 0
            ? text.slice(bodyIndex + "本文:".length).trim()
            : text.trim();
        return { subject, body };
      };

      // バッチアイテムを準備
      const batchItems = targets.map((card) => {
        const sentAtIso = new Date().toISOString();
        const linkEntries = selectedPdfIdList.map((pdfId, index) => {
          const token = crypto.randomUUID();
          const placeholder = `{{PDF_LINK_${index + 1}}}`;
          const urlPath = `/pdf/${token}`;
          const fullUrl = `${origin}${urlPath}`;
          return { pdfId, token, placeholder, fullUrl };
        });

        let messageWithLinks = card.generatedMessage;
        for (const entry of linkEntries) {
          messageWithLinks = replaceAll(
            messageWithLinks,
            entry.placeholder,
            entry.fullUrl,
          );
        }

        const { subject, body } = extractSubjectAndBody(messageWithLinks);

        return {
          cardId: card.id,
          card,
          sentAtIso,
          linkEntries,
          payload: {
            url: card.homepageUrl,
            company: senderProfile.companyName,
            department: senderProfile.department,
            title: senderProfile.title,
            person: senderProfile.fullName,
            name: senderProfile.fullName,
            lastName: senderProfile.lastName,
            firstName: senderProfile.firstName,
            lastNameKana: senderProfile.lastNameKana,
            firstNameKana: senderProfile.firstNameKana,
            fullNameKana:
              `${senderProfile.lastNameKana} ${senderProfile.firstNameKana}`.trim(),
            email: senderProfile.email,
            phone: senderProfile.phone,
            postalCode: senderProfile.postalCode,
            prefecture: senderProfile.prefecture,
            city: senderProfile.city,
            address: senderProfile.address,
            building: senderProfile.building,
            subject,
            message: body,
          },
        };
      });

      // バッチ送信API呼び出し（SSE）
      const response = await fetch("/api/auto-submit/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: batchItems.map((item) => item.payload),
          debug: false, // 本番環境ではヘッドレスモード
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Batch request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let successCount = 0;
      let failedCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text
          .split("\n")
          .filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "item_start") {
              const item = batchItems[data.index];
              if (item) {
                pushLog(
                  `送信中: ${item.card.companyName || item.card.homepageUrl}`,
                );
              }
            } else if (data.type === "item_complete") {
              const item = batchItems[data.index];
              if (item) {
                const label = item.card.companyName || item.card.homepageUrl;
                if (data.success) {
                  successCount++;
                  pushLog(`送信成功: ${label}`);
                  // PDF送信ログを保存
                  if (item.linkEntries.length > 0) {
                    await fetch("/api/pdf/send-log", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        logs: item.linkEntries.map((entry) => ({
                          pdf_id: entry.pdfId,
                          token: entry.token,
                          recipient_company_name: item.card.companyName,
                          recipient_homepage_url: item.card.homepageUrl,
                          recipient_email: item.card.email,
                          sent_at: item.sentAtIso,
                        })),
                      }),
                    });
                  }
                  // リードの送信結果をDBに更新
                  if (item.card.leadId) {
                    await fetch(`/api/leads/${item.card.leadId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ sendStatus: "success" }),
                    });
                  }
                } else {
                  failedCount++;
                  // CAPTCHA検出の場合は blocked、それ以外は failed
                  const isCaptcha = data.note === "CAPTCHA detected";
                  const newStatus = isCaptcha ? "blocked" : "failed";
                  pushLog(
                    isCaptcha
                      ? `送信不可（CAPTCHA）: ${label}`
                      : `送信失敗: ${label}`,
                  );
                  // リードの送信結果をDBに更新
                  if (item.card.leadId) {
                    await fetch(`/api/leads/${item.card.leadId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ sendStatus: newStatus }),
                    });
                  }
                }
                setSendResults((prev) => [
                  ...prev,
                  {
                    companyName: item.card.companyName || label,
                    homepageUrl: item.card.homepageUrl,
                    email: item.card.email,
                    status: data.success
                      ? "success"
                      : data.note === "CAPTCHA detected"
                        ? "blocked"
                        : "failed",
                    sentAtIso: item.sentAtIso,
                  },
                ]);
              }
            } else if (data.type === "item_error") {
              const item = batchItems[data.index];
              if (item) {
                failedCount++;
                pushLog(
                  `送信エラー: ${item.card.companyName || item.card.homepageUrl}`,
                );
              }
            } else if (data.type === "batch_complete") {
              pushLog(`送信完了（成功 ${successCount} / 失敗 ${failedCount}）`);
            }
          } catch {
            // JSONパースエラーは無視
          }
        }
      }

      return { successCount, failedCount };
    },
    [pushLog, selectedPdfIdList, senderProfile],
  );

  const handleSimulateSend = useCallback(
    async (overrideCards?: CompanyCard[]) => {
      const targets = (overrideCards ?? sendableReadyCards).filter(
        (card) => card.sendEnabled && card.status === "ready",
      );
      if (!targets.length) {
        pushLog("送信する企業がありません。");
        return;
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      if (!origin) {
        pushLog("送信処理を開始できませんでした。");
        return;
      }

      resetSendResults();

      // flushSync で即座に UI を更新
      flushSync(() => {
        setIsSending(true);
      });

      pushLog(`送信を開始します（${targets.length}件）`);

      try {
        await handleBatchSend(targets, origin);
        setLastSendFinishedAt(new Date().toISOString());
        // 送信結果を反映するためAgGridを再読み込み
        await fetchLeads(leadsPage);
      } catch {
        pushLog("送信処理でエラーが発生しました。");
      } finally {
        setIsSending(false);
      }
    },
    [
      handleBatchSend,
      pushLog,
      resetSendResults,
      sendableReadyCards,
      fetchLeads,
      leadsPage,
    ],
  );

  const runAutoWorkflow = useCallback(
    async (
      cardSnapshots: CompanyCard[],
      skipSendLeadIds: Set<string> = new Set(),
    ) => {
      if (!cardSnapshots.length) return;
      if (autoRunStatus === "running") return;

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      if (!origin) {
        pushLog("自動送信を開始できませんでした。");
        return;
      }

      resetSendResults();
      setAutoRunStatus("running");
      setAutoRunMessage("自動送信を開始します（並行処理）...");
      pushLog(
        `⚡ 自動送信を開始します（${cardSnapshots.length}件）- AI生成と送信を並行実行`,
      );

      // 文面作成状況に待機中の件数を表示
      const cardIds = cardSnapshots.map((c) => c.id);
      setQueueState((prev) => ({
        ...prev,
        pendingIds: cardIds,
        running: true,
      }));

      try {
        // 送信待ちキュー
        const readyQueue: CompanyCard[] = [];
        let generationComplete = false;
        let isSendingBatch = false;
        let totalGenerated = 0;
        let totalSent = 0;
        let successCount = 0;
        let failedCount = 0;

        // バッチ送信処理
        const processSendQueue = async () => {
          if (isSendingBatch || readyQueue.length === 0) return;

          isSendingBatch = true;
          const batch = readyQueue.splice(0, readyQueue.length); // キューを空にして取得

          if (batch.length > 0) {
            setAutoRunMessage(`送信中: ${batch.length}件`);
            pushLog(`📤 バッチ送信開始: ${batch.length}件`);

            try {
              const result = await handleBatchSend(batch, origin);
              successCount += result.successCount;
              failedCount += result.failedCount;
              totalSent += batch.length;
            } catch (error) {
              failedCount += batch.length;
              pushLog(
                `送信エラー: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          isSendingBatch = false;
        };

        // AI生成タスク（並行実行）
        const generateTasks = cardSnapshots.map(async (snapshot, index) => {
          const label =
            snapshot.companyName ||
            snapshot.contactName ||
            snapshot.homepageUrl;

          try {
            pushLog(
              `🔄 文面生成開始: ${label} (${index + 1}/${cardSnapshots.length})`,
            );
            setAutoRunMessage(
              `文面作成中 (${index + 1}/${cardSnapshots.length}): ${label}`,
            );
            const finalMessage = await handleGenerateEntry(
              snapshot.id,
              snapshot,
            );

            const readyCard: CompanyCard = {
              ...snapshot,
              generatedMessage: finalMessage,
              status: "ready",
              sendEnabled: true,
            };

            totalGenerated++;
            pushLog(
              `✅ 文面生成完了: ${label} (${totalGenerated}/${cardSnapshots.length})`,
            );

            // 待機中リストから削除
            setQueueState((prev) => ({
              ...prev,
              pendingIds: prev.pendingIds.filter((id) => id !== snapshot.id),
              lastProcessed: snapshot.id,
            }));

            // 過去に失敗したリードは送信をスキップ（送信結果には失敗として追加）
            if (snapshot.leadId && skipSendLeadIds.has(snapshot.leadId)) {
              failedCount++;
              setSendResults((prev) => [
                ...prev,
                {
                  companyName: readyCard.companyName || label,
                  homepageUrl: readyCard.homepageUrl,
                  email: readyCard.email,
                  status: "failed" as const,
                  sentAtIso: new Date().toISOString(),
                },
              ]);
            } else {
              readyQueue.push(readyCard);
              // キューに3件以上溜まったら送信処理を開始
              if (readyQueue.length >= 3 && !isSendingBatch) {
                processSendQueue();
              }
            }
          } catch (error) {
            pushLog(
              `❌ 文面生成失敗: ${label} - ${error instanceof Error ? error.message : String(error)}`,
            );
            // 失敗時も待機中リストから削除
            setQueueState((prev) => ({
              ...prev,
              pendingIds: prev.pendingIds.filter((id) => id !== snapshot.id),
            }));
          }
        });

        // 定期的にキューをチェックして送信
        const queueCheckInterval = setInterval(() => {
          if (readyQueue.length > 0 && !isSendingBatch) {
            processSendQueue();
          }
        }, 3000); // 3秒ごとにチェック

        // すべてのAI生成タスクを並行実行（最大3つ同時）
        const concurrencyLimit = 3;
        for (let i = 0; i < generateTasks.length; i += concurrencyLimit) {
          const chunk = generateTasks.slice(i, i + concurrencyLimit);
          await Promise.all(chunk);
        }

        generationComplete = true;
        clearInterval(queueCheckInterval);

        // 残りのキューを送信
        while (readyQueue.length > 0) {
          await processSendQueue();
          if (readyQueue.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        // 送信中の処理が完了するまで待機
        while (isSendingBatch) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        setLastSendFinishedAt(new Date().toISOString());
        pushLog(
          `🎉 自動送信完了（成功 ${successCount} / 失敗 ${failedCount}）`,
        );

        setAutoRunStatus("done");
        setAutoRunMessage("自動送信が完了しました。");
        // キュー状態をリセット
        setQueueState((prev) => ({
          ...prev,
          pendingIds: [],
          running: false,
        }));
        // 送信結果を反映するためAgGridを再読み込み
        await fetchLeads(leadsPage);
      } catch (error) {
        setAutoRunStatus("error");
        setAutoRunMessage("自動送信でエラーが発生しました。");
        pushLog(
          `自動送信でエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        );
        // エラー時もキュー状態をリセット
        setQueueState((prev) => ({
          ...prev,
          pendingIds: [],
          running: false,
        }));
      }
    },
    [
      autoRunStatus,
      handleBatchSend,
      handleGenerateEntry,
      fetchLeads,
      leadsPage,
      pushLog,
      resetSendResults,
    ],
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
          throw new Error("データ行が存在しません。");
        }

        const dataRows = rows
          .slice(1)
          .map((row) => row.map((cell) => sanitize(cell)))
          .filter((row) => row.some((cell) => cell.length > 0));

        // 新フォーマット: 1列目=企業名, 2列目=URL, 3列目=担当者名, 4列目=部署名, 5列目=役職名, 6列目=メールアドレス
        const validRows: Array<{
          companyName: string;
          homepageUrl: string;
          contactName: string;
          department: string;
          title: string;
          email: string;
        }> = [];
        let skippedMissingRequired = 0;

        for (const row of dataRows) {
          const companyName = (row[0] ?? "").trim();
          const url = (row[1] ?? "").trim();
          if (companyName.length > 0 && url.length > 0) {
            validRows.push({
              companyName,
              homepageUrl: normalizeHomepageUrl(url),
              contactName: (row[2] ?? "").trim(),
              department: (row[3] ?? "").trim(),
              title: (row[4] ?? "").trim(),
              email: (row[5] ?? "").trim(),
            });
          } else {
            skippedMissingRequired += 1;
          }
        }

        if (skippedMissingRequired > 0) {
          showToast(
            `${skippedMissingRequired}件の行をスキップしました（企業名 または URL が未入力）`,
            "warning",
          );
        }

        if (validRows.length === 0) {
          throw new Error("有効なデータ行がありません。");
        }

        // APIにインポート（ファイル名も送信）
        const importRes = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leads: validRows, fileName: file.name }),
        });

        const importData = await importRes.json();
        if (!importRes.ok) {
          throw new Error(importData.error || "インポートに失敗しました");
        }

        setUploadState({
          fileName: file.name,
          importedCount: importData.imported || 0,
          skippedCount: skippedMissingRequired + (importData.duplicates || 0),
          lastImportedAt: Date.now(),
        });

        pushLog(
          `CSV読み込み: ${importData.imported}件をインポートしました（重複: ${importData.duplicates}件）`,
        );

        // リード一覧を再取得
        await fetchLeads(1);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Excelの読み込みに失敗しました。";
        setUploadState((prev) => ({
          ...prev,
          error: message,
        }));
        console.debug("[ai-custom] excel upload failed", message);
        pushLog("⚠️ Excel/CSVの読み込みに失敗しました。");
      }
    },
    [fetchLeads, pushLog, showToast],
  );

  // 選択したリードからAI文言を生成（送信しない）- 並列処理
  const handleGenerateSelectedLeads = useCallback(async () => {
    if (selectedLeadIds.size === 0) {
      showToast("生成する企業を選択してください", "warning");
      return;
    }

    if (selectedLeadIds.size > 100) {
      showToast("一度に生成できるのは100件までです", "warning");
      return;
    }

    if (queueState.running) return;

    const selectedLeads = leads.filter((lead) => selectedLeadIds.has(lead.id));

    // カードを生成
    const cardsToGenerate = selectedLeads.map((lead) => ({
      ...createEmptyCard(),
      leadId: lead.id,
      companyName: lead.companyName,
      contactName: lead.contactName,
      department: lead.department,
      title: lead.title,
      email: lead.email,
      homepageUrl: lead.homepageUrl,
    }));

    setCards(cardsToGenerate);
    pushLog(`${cardsToGenerate.length}件のAI文言生成を開始しました`);

    // 文面作成状況に待機中の件数を表示
    const cardIds = cardsToGenerate.map((c) => c.id);
    setQueueState((prev) => ({
      ...prev,
      pendingIds: cardIds,
      running: true,
    }));

    let totalGenerated = 0;

    // AI生成タスク（並行実行）
    const generateTasks = cardsToGenerate.map(async (snapshot, index) => {
      const label =
        snapshot.companyName || snapshot.contactName || snapshot.homepageUrl;

      try {
        pushLog(
          `🔄 文面生成開始: ${label} (${index + 1}/${cardsToGenerate.length})`,
        );
        await handleGenerateEntry(snapshot.id, snapshot);

        totalGenerated++;
        pushLog(
          `✅ 文面生成完了: ${label} (${totalGenerated}/${cardsToGenerate.length})`,
        );

        // 待機中リストから削除
        setQueueState((prev) => ({
          ...prev,
          pendingIds: prev.pendingIds.filter((id) => id !== snapshot.id),
          lastProcessed: snapshot.id,
        }));
      } catch (error) {
        pushLog(
          `❌ 文面生成失敗: ${label} - ${error instanceof Error ? error.message : String(error)}`,
        );
        // 失敗時も待機中リストから削除
        setQueueState((prev) => ({
          ...prev,
          pendingIds: prev.pendingIds.filter((id) => id !== snapshot.id),
        }));
      }
    });

    // すべてのAI生成タスクを並行実行（最大3つ同時）
    const concurrencyLimit = 3;
    for (let i = 0; i < generateTasks.length; i += concurrencyLimit) {
      const chunk = generateTasks.slice(i, i + concurrencyLimit);
      await Promise.all(chunk);
    }

    // 完了時にキュー状態をリセット
    setQueueState((prev) => ({
      ...prev,
      pendingIds: [],
      running: false,
    }));

    pushLog(
      `🎉 AI文言生成完了（${totalGenerated}/${cardsToGenerate.length}件）`,
    );
  }, [
    handleGenerateEntry,
    leads,
    pushLog,
    queueState.running,
    selectedLeadIds,
    showToast,
  ]);

  // 選択したリードからAI文言を生成して送信
  const handleGenerateAndSendSelectedLeads = useCallback(() => {
    if (selectedLeadIds.size === 0) {
      showToast("送信する企業を選択してください", "warning");
      return;
    }

    if (selectedLeadIds.size > 100) {
      showToast("一度に送信できるのは100件までです", "warning");
      return;
    }

    const selectedLeads = leads.filter((lead) => selectedLeadIds.has(lead.id));

    // 失敗済み・ブロック済みのリードIDを記録（送信時にスキップするため）
    const skipLeadIds = new Set(
      selectedLeads
        .filter(
          (lead) =>
            lead.sendStatus === "failed" || lead.sendStatus === "blocked",
        )
        .map((lead) => lead.id),
    );

    // 全てのリードでカードを生成（文言生成は全て行う）
    const cardsToSend = selectedLeads.map((lead) => ({
      ...createEmptyCard(),
      leadId: lead.id,
      companyName: lead.companyName,
      contactName: lead.contactName,
      department: lead.department,
      title: lead.title,
      email: lead.email,
      homepageUrl: lead.homepageUrl,
    }));

    setCards(cardsToSend);
    pushLog(`${cardsToSend.length}件のAI文言生成を開始しました`);
    setTimeout(() => {
      void runAutoWorkflow(cardsToSend, skipLeadIds);
    }, 0);
  }, [leads, pushLog, runAutoWorkflow, selectedLeadIds, showToast]);

  // 選択したリードを削除
  const handleDeleteSelectedLeads = useCallback(async () => {
    if (selectedLeadIds.size === 0) return;

    setIsDeleting(true);
    try {
      const deletePromises = Array.from(selectedLeadIds).map((id) =>
        fetch(`/api/leads/${id}`, { method: "DELETE" }),
      );
      await Promise.all(deletePromises);
      showToast(`${selectedLeadIds.size}件のリードを削除しました`, "success");
      setSelectedLeadIds(new Set());
      await fetchLeads(leadsPage);
    } catch (error) {
      console.error("Delete error:", error);
      showToast("削除に失敗しました", "error");
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  }, [selectedLeadIds, showToast, fetchLeads, leadsPage]);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleExcelUpload(file);
      }
      event.target.value = "";
    },
    [handleExcelUpload],
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
    [handleExcelUpload],
  );

  const downloadSampleCsv = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = "/sample/sample.csv";
    link.download = "sample.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const downloadSendResultsCsv = useCallback(
    (kind: "success" | "failed" | "all") => {
      const rows =
        kind === "all"
          ? sendResults
          : sendResults.filter((r) => r.status === kind);
      if (rows.length === 0) return;

      const escape = (value: string) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const header = ["結果", "会社名", "URL", "メール", "送信日時"];
      const lines = rows.map((r) =>
        [
          r.status === "success" ? "成功" : "失敗",
          r.companyName,
          r.homepageUrl,
          r.email,
          new Date(r.sentAtIso).toLocaleString("ja-JP"),
        ]
          .map(escape)
          .join(","),
      );

      const bom = "\uFEFF";
      const csv = `${bom}${header.join(",")}\n${lines.join("\n")}\n`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().replaceAll(":", "-");
      const kindLabel =
        kind === "success" ? "成功" : kind === "failed" ? "失敗" : "全件";
      a.download = `送信結果_${kindLabel}_${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [sendResults],
  );

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 md:pl-64">
      <AppSidebar />

      {/* トースト通知 */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${
              toastType === "error"
                ? "border-rose-200 bg-rose-50/90 text-rose-700 dark:border-rose-800 dark:bg-rose-900/90 dark:text-rose-300"
                : toastType === "warning"
                  ? "border-amber-200 bg-amber-50/90 text-amber-700 dark:border-amber-800 dark:bg-amber-900/90 dark:text-amber-300"
                  : "border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/90 dark:text-emerald-300"
            }`}
          >
            <span className="text-sm font-medium">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-current opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
              onChange={(value) =>
                handleSenderProfileChange("companyName", value)
              }
            />
            <InputField
              label="部署"
              required
              value={senderProfile.department}
              onChange={(value) =>
                handleSenderProfileChange("department", value)
              }
            />
            <InputField
              label="役職"
              required
              value={senderProfile.title}
              onChange={(value) => handleSenderProfileChange("title", value)}
            />
            <InputField
              label="担当者名（フルネーム）"
              required
              value={senderProfile.fullName}
              onChange={(value) => handleSenderProfileChange("fullName", value)}
            />
            <InputField
              label="姓（漢字）"
              required
              placeholder="例: 山田"
              value={senderProfile.lastName}
              onChange={(value) => handleSenderProfileChange("lastName", value)}
            />
            <InputField
              label="名（漢字）"
              required
              placeholder="例: 太郎"
              value={senderProfile.firstName}
              onChange={(value) =>
                handleSenderProfileChange("firstName", value)
              }
            />
            <InputField
              label="姓（ふりがな）"
              required
              placeholder="例: やまだ"
              value={senderProfile.lastNameKana}
              onChange={(value) =>
                handleSenderProfileChange("lastNameKana", value)
              }
            />
            <InputField
              label="名（ふりがな）"
              required
              placeholder="例: たろう"
              value={senderProfile.firstNameKana}
              onChange={(value) =>
                handleSenderProfileChange("firstNameKana", value)
              }
            />
            <InputField
              label="メールアドレス"
              type="email"
              required
              value={senderProfile.email}
              onChange={(value) => handleSenderProfileChange("email", value)}
            />
            <InputField
              label="電話番号"
              required
              value={senderProfile.phone}
              onChange={(value) => handleSenderProfileChange("phone", value)}
            />
            <InputField
              label="郵便番号"
              required
              placeholder="例: 100-0001"
              value={senderProfile.postalCode}
              onChange={(value) =>
                handleSenderProfileChange("postalCode", value)
              }
            />
            <InputField
              label="都道府県"
              required
              placeholder="例: 東京都"
              value={senderProfile.prefecture}
              onChange={(value) =>
                handleSenderProfileChange("prefecture", value)
              }
            />
            <InputField
              label="市区町村"
              required
              placeholder="例: 千代田区"
              value={senderProfile.city}
              onChange={(value) => handleSenderProfileChange("city", value)}
            />
            <InputField
              label="住所（番地以降）"
              required
              placeholder="例: 千代田1-1"
              value={senderProfile.address}
              onChange={(value) => handleSenderProfileChange("address", value)}
            />
            <div className="sm:col-span-2">
              <InputField
                label="建物名（任意）"
                placeholder="例: 〇〇ビル 5F"
                value={senderProfile.building}
                onChange={(value) =>
                  handleSenderProfileChange("building", value)
                }
              />
            </div>
            <div className="sm:col-span-2">
              <InputField
                label="件名"
                required
                value={senderProfile.subject}
                onChange={(value) =>
                  handleSenderProfileChange("subject", value)
                }
              />
            </div>
            <div className="sm:col-span-2">
              <InputField
                label="商談日程URL（任意）"
                placeholder="例: https://calendly.com/your-link"
                value={senderProfile.meetingUrl}
                onChange={(value) =>
                  handleSenderProfileChange("meetingUrl", value)
                }
              />
            </div>
          </div>
          {senderMissingFields.length > 0 && (
            <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              必須項目が不足しています
            </div>
          )}
        </section>

        {autoRunStatus !== "idle" && (
          <div
            className={`card-clean border ${
              autoRunStatus === "error"
                ? "border-rose-500/40 bg-rose-500/5"
                : autoRunStatus === "running"
                  ? "border-primary/40 bg-primary/5"
                  : "border-emerald-400/40 bg-emerald-500/5"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
                  autoRunStatus === "error"
                    ? "bg-rose-500/20 text-rose-300"
                    : autoRunStatus === "running"
                      ? "bg-primary/20 text-primary"
                      : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                {autoRunStatus === "running" && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {autoRunStatus === "error" && "⚠️"}
                {autoRunStatus === "done" && "✅"}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {autoRunStatus === "running"
                    ? "自動送信フローを実行中"
                    : autoRunStatus === "error"
                      ? "自動送信フローでエラー"
                      : "自動送信が完了しました"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {autoRunMessage}
                </p>
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
                  <p className="text-sm text-muted-foreground mb-4">
                    {group.description}
                  </p>
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
          <SectionHeader
            number="03"
            title="添付するPDF（商品資料）を選択"
            description="※ 1送信につき1つまで選択できます。選択したPDFは送信時に企業ごとの専用URLに自動変換され、本文に添付リンクとして差し込まれます。PDFの追加/削除はPDF管理で行います。"
          />

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              選択した資料は送信時に自動で専用URLへ変換され、本文にリンクとして差し込まれます。
            </p>
            <div className="flex items-center gap-2">
              <Tooltip label="再読み込み" position="top" withArrow>
                <button
                  type="button"
                  onClick={() => void fetchPdfLibrary()}
                  className="btn-secondary text-xs p-2"
                  disabled={pdfLibraryLoading}
                  aria-label="再読み込み"
                >
                  <RefreshCw
                    size={16}
                    className={pdfLibraryLoading ? "animate-spin" : ""}
                  />
                </button>
              </Tooltip>
              <Link href="/pdf-assets" className="btn-primary text-xs">
                PDF管理へ
              </Link>
            </div>
          </div>

          {pdfLibraryError && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {pdfLibraryError}
            </div>
          )}

          {pdfAssets.length === 0 && !pdfLibraryLoading ? (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                まだPDFが登録されていません。先にPDF管理画面で商品資料を追加してください。
              </p>
              <div className="mt-4 flex justify-center">
                <Link href="/pdf-assets" className="btn-primary">
                  PDFを追加する
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pdfAssets.map((pdf) => {
                const isSelected = Boolean(selectedPdfIds[pdf.id]);

                return (
                  <div
                    key={pdf.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={isSelected}
                        onChange={(event) =>
                          handlePdfSelectionToggle(pdf.id, event.target.checked)
                        }
                      />
                      <span
                        className="text-sm font-medium text-foreground truncate"
                        title={pdf.name}
                      >
                        {pdf.name}
                      </span>
                    </label>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatBytes(pdf.size)}</span>
                      <span>
                        {pdf.uploadedAt
                          ? new Date(pdf.uploadedAt).toLocaleString("ja-JP")
                          : "-"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* リード管理 */}
        <section className="card-clean p-8">
          <div className="mb-8">
            <SectionHeader
              number="04"
              title="リード管理"
              description="CSVをインポートしてリードを管理します。送信したい行を選択してください。"
            />
          </div>

          {/* CSVインポートエリア（コンパクト版） */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">
                CSVから一括登録
              </p>
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 hover:underline"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                サンプルをダウンロード
              </button>
            </div>

            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`dropzone group relative flex flex-col cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5 is-active"
                  : "border-border hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInputChange}
                className="sr-only"
              />
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full mb-2 transition-colors ${
                  isDragging
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                }`}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">
                  ファイルをここにドラッグ＆ドロップ
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  またはクリックしてファイルを選択
                </p>
                <p className="text-xs text-muted-foreground/70 mt-2">
                  (.xlsx / .xls / .csv)
                </p>
              </div>
            </label>

            <p className="text-xs text-muted-foreground mt-3 text-center">
              形式: 企業名 / URL / 担当者名 / 部署名 / 役職名 / メールアドレス
            </p>

            {uploadState.fileName && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {uploadState.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    取り込み: {uploadState.importedCount} / スキップ:{" "}
                    {uploadState.skippedCount}
                  </p>
                </div>
                {uploadState.error && (
                  <span className="text-xs text-rose-500">
                    {uploadState.error}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* テーブル操作ボタン */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              {leads.length > 0
                ? `${leads.length}件のリード`
                : "リードがありません"}
            </span>
            <div className="flex items-center gap-2">
              <Tooltip label="選択したリードを削除" position="top" withArrow>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="btn-secondary text-xs p-2 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                  disabled={selectedLeadIds.size === 0}
                  aria-label="選択したリードを削除"
                >
                  <Trash2 size={16} />
                </button>
              </Tooltip>
              <Tooltip label="CSVエクスポート" position="top" withArrow>
                <button
                  type="button"
                  onClick={handleExportLeadsCsv}
                  className="btn-secondary text-xs p-2"
                  disabled={leads.length === 0}
                  aria-label="CSVエクスポート"
                >
                  <Download size={16} />
                </button>
              </Tooltip>
              <Tooltip label="再読み込み" position="top" withArrow>
                <button
                  type="button"
                  onClick={() => void fetchLeads(leadsPage)}
                  className="btn-secondary text-xs p-2"
                  disabled={leadsLoading}
                  aria-label="再読み込み"
                >
                  <RefreshCw
                    size={16}
                    className={leadsLoading ? "animate-spin" : ""}
                  />
                </button>
              </Tooltip>
            </div>
          </div>

          <div
            className="rounded-lg border border-border overflow-hidden"
            style={{ height: 500, width: "100%" }}
          >
            <AgGridReact<LeadRow>
              theme={agGridTheme}
              rowData={leads}
              columnDefs={leadColumnDefs}
              defaultColDef={defaultColDef}
              rowSelection={{
                mode: "multiRow",
                checkboxes: true,
                headerCheckbox: true,
                enableClickSelection: false,
              }}
              animateRows={true}
              pagination={true}
              paginationPageSize={100}
              onGridReady={onGridReady}
              onSelectionChanged={onSelectionChanged}
              onCellValueChanged={onCellValueChanged}
              onRowDragEnd={onRowDragEnd}
              getRowId={(params) => params.data.id}
              overlayNoRowsTemplate="リードがありません。CSVをインポートしてください。"
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                選択中:{" "}
                <span className="font-bold text-primary">
                  {selectedLeadIds.size}
                </span>{" "}
                件
              </span>
              <span className="text-sm text-muted-foreground">
                全 {leads.length} 件
              </span>
            </div>

            <div className="flex items-center gap-3">
              {leadsTotalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void fetchLeads(leadsPage - 1)}
                    disabled={leadsPage <= 1 || leadsLoading}
                    className="btn-secondary text-xs"
                  >
                    前へ
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {leadsPage} / {leadsTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => void fetchLeads(leadsPage + 1)}
                    disabled={leadsPage >= leadsTotalPages || leadsLoading}
                    className="btn-secondary text-xs"
                  >
                    次へ
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateSelectedLeads}
                disabled={
                  selectedLeadIds.size === 0 ||
                  queueState.running ||
                  autoRunStatus === "running"
                }
                className="btn-secondary min-w-[180px]"
              >
                {queueState.running || autoRunStatus === "running"
                  ? "生成中..."
                  : `AI文言を生成（${selectedLeadIds.size}件）`}
              </button>

              <button
                type="button"
                onClick={handleGenerateAndSendSelectedLeads}
                disabled={
                  selectedLeadIds.size === 0 ||
                  isSending ||
                  autoRunStatus === "running" ||
                  queueState.running
                }
                className="btn-primary min-w-[180px]"
              >
                {isSending || autoRunStatus === "running"
                  ? "処理中..."
                  : `生成して送信（${selectedLeadIds.size}件）`}
              </button>
            </div>
          </div>
        </section>

        {/* 文面作成状況とログ */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card-clean p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">
                文面作成状況
              </h3>
              <span className="text-xs font-medium bg-muted px-2 py-1 rounded text-muted-foreground">
                {queueState.pendingIds.length} 件待機中
              </span>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">状態:</span>
                  <span
                    className={`font-medium ${queueState.running ? "text-primary animate-pulse" : "text-foreground"}`}
                  >
                    {queueState.running ? "作成中..." : "待機中"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最後に処理:</span>
                  <span className="text-foreground truncate max-w-[150px]">
                    {queueState.lastProcessed || "-"}
                  </span>
                </div>
                {queueState.error && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-rose-500 text-xs">
                    {queueState.error}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleQueuePendingCards}
                  className="btn-secondary flex-1 text-xs"
                >
                  リトライ
                </button>
                <button
                  onClick={clearQueue}
                  className="btn-secondary flex-1 text-xs"
                >
                  停止
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleSimulateSend()}
                disabled={isSending || sendableReadyCards.length === 0}
                className="btn-primary w-full mt-2"
              >
                {isSending ? "送信中..." : "チェック済み企業へ一括送信"}
              </button>

              {sendSummary.total > 0 && (
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      送信結果
                    </p>
                    {lastSendFinishedAt && (
                      <p className="text-[10px] text-muted-foreground">
                        完了:{" "}
                        {new Date(lastSendFinishedAt).toLocaleString("ja-JP")}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs">
                    <span className="font-semibold text-emerald-400">
                      成功 {sendSummary.success}
                    </span>
                    <span className="font-semibold text-rose-400">
                      失敗 {sendSummary.failed}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => downloadSendResultsCsv("success")}
                      disabled={sendSummary.success === 0}
                    >
                      成功CSV
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => downloadSendResultsCsv("failed")}
                      disabled={sendSummary.failed === 0}
                    >
                      失敗CSV
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => downloadSendResultsCsv("all")}
                    >
                      全件CSV
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card-clean p-6 flex flex-col h-full max-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                実行ログ
              </h3>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                クリア
              </button>
            </div>
            <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-muted/10">
              <Conversation className="h-full">
                <ConversationContent>
                  {logs.length === 0 ? (
                    <ConversationEmptyState
                      title="ログはありません"
                      description="処理を開始するとここに実行ログが表示されます"
                    />
                  ) : (
                    logs.map((log, i) => (
                      <Message from="assistant" key={`${i}-${log}`}>
                        <MessageContent className="w-full">
                          <div className="text-xs text-foreground whitespace-pre-wrap break-words">
                            {log}
                          </div>
                        </MessageContent>
                      </Message>
                    ))
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <SectionHeader number="05" title="企業カード一覧" />
            <p className="text-sm font-medium text-muted-foreground">
              <span className="text-primary font-bold">
                {sendableReadyCards.length}
              </span>{" "}
              / {sendableCards.length} 社 OK
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
                  selectedPdfIdList={selectedPdfIdList}
                  handleCardFieldChange={handleCardFieldChange}
                  handleToggleSendEnabled={handleToggleSendEnabled}
                  handleMessageChange={handleMessageChange}
                  handleGenerateEntry={handleGenerateEntry}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 削除確認モーダル */}
      <Modal
        opened={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="リードの削除"
        centered
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            選択した{" "}
            <span className="font-bold text-foreground">
              {selectedLeadIds.size}件
            </span>{" "}
            のリードを削除しますか？
          </p>
          <p className="text-xs text-rose-500">この操作は取り消せません。</p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              キャンセル
            </Button>
            <Button
              color="red"
              onClick={() => void handleDeleteSelectedLeads()}
              loading={isDeleting}
            >
              削除する
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SectionHeader({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description?: string;
}) {
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
  selectedPdfIdList,
  handleCardFieldChange,
  handleToggleSendEnabled,
  handleMessageChange,
  handleGenerateEntry,
}: {
  card: CompanyCard;
  pdfAssets: PdfAsset[];
  selectedPdfIdList: string[];
  handleCardFieldChange: (
    cardId: string,
    field: CompanyCardField,
    value: string,
  ) => void;
  handleToggleSendEnabled: (cardId: string) => void;
  handleMessageChange: (cardId: string, value: string) => void;
  handleGenerateEntry: (
    cardId: string,
    snapshot?: CompanyCard,
  ) => Promise<string>;
}) {
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  // 生成中はスクロールを末尾に追従させる
  useEffect(() => {
    if (card.status !== "generating" && card.status !== "ready") return;
    const el = messageRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [card.generatedMessage, card.status]);

  return (
    <div
      className={`card-clean p-6 transition-all ${card.status === "generating" ? "ring-2 ring-primary/20" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 mb-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${card.sendEnabled ? "bg-primary border-primary text-white" : "bg-card border-muted-foreground/40"}`}
            >
              {card.sendEnabled && (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={card.sendEnabled}
              onChange={() => handleToggleSendEnabled(card.id)}
              className="sr-only"
              disabled={card.status === "generating"}
            />
            <span className="text-sm font-semibold text-foreground">
              送信対象
            </span>
          </label>

          <div className="h-4 w-[1px] bg-border"></div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-md border ${!card.homepageUrl ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-muted border-transparent text-muted-foreground"}`}
            >
              {card.homepageUrl ? "URLあり" : "URLなし"}
            </span>
            <StatusBadge status={card.status} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleGenerateEntry(card.id, card)}
          disabled={card.status === "generating"}
          className="btn-secondary text-xs py-1.5 h-8"
        >
          {card.status === "generating" ? "生成中..." : "このカードを生成"}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            企業情報
          </h4>
          <div className="grid gap-3">
            <InputField
              label="相手企業名"
              value={card.companyName}
              placeholder="例: 株式会社◯◯"
              onChange={(value) =>
                handleCardFieldChange(card.id, "companyName", value)
              }
              disabled={card.status === "generating"}
            />
            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="担当者名"
                value={card.contactName}
                placeholder="例: 山田様"
                onChange={(value) =>
                  handleCardFieldChange(card.id, "contactName", value)
                }
                disabled={card.status === "generating"}
              />
              <InputField
                label="役職"
                value={card.title}
                onChange={(value) =>
                  handleCardFieldChange(card.id, "title", value)
                }
                disabled={card.status === "generating"}
              />
            </div>
            <InputField
              label="HP URL *"
              value={card.homepageUrl}
              onChange={(value) =>
                handleCardFieldChange(
                  card.id,
                  "homepageUrl",
                  normalizeHomepageUrl(value),
                )
              }
              disabled={card.status === "generating"}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            生成コンテンツ
          </h4>
          <div className="relative">
            <textarea
              ref={messageRef}
              value={card.generatedMessage}
              onChange={(event) =>
                handleMessageChange(card.id, event.target.value)
              }
              rows={8}
              placeholder="AI生成結果がここに表示されます..."
              disabled={card.status === "generating"}
              className="input-clean min-h-[200px] resize-y font-mono text-sm leading-relaxed"
            />
            {card.status === "generating" && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Attachments (placeholders) */}
      {selectedPdfIdList.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            添付資料（送信時に企業別URLへ置換）
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {selectedPdfIdList.map((pdfId, index) => {
              const pdfName =
                pdfAssets.find((asset) => asset.id === pdfId)?.name ??
                "添付資料";
              const placeholder = `{{PDF_LINK_${index + 1}}}`;
              return (
                <div
                  key={pdfId}
                  className="rounded-xl border border-border bg-muted/30 p-4"
                >
                  <p
                    className="text-sm font-medium text-foreground truncate"
                    title={pdfName}
                  >
                    {pdfName}
                  </p>
                  <code className="mt-2 block break-all rounded bg-black/20 px-2 py-1 text-xs font-mono text-muted-foreground">
                    {placeholder}
                  </code>
                </div>
              );
            })}
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
  type = "text",
  placeholder,
  className,
  disabled,
  required,
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
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`input-clean ${disabled ? "opacity-60 cursor-not-allowed bg-muted" : ""}`}
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
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {helper && (
        <span className="text-xs text-muted-foreground opacity-80">
          {helper}
        </span>
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

function StatusBadge({ status }: { status: CompanyCard["status"] }) {
  const styles = {
    ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
    generating: "bg-amber-50 text-amber-700 border-amber-200 animate-pulse",
    error: "bg-rose-50 text-rose-700 border-rose-200",
    pending: "bg-slate-100 text-slate-600 border-slate-200",
  };

  const labels = {
    ready: "完了",
    generating: "生成中",
    error: "エラー",
    pending: "待機",
  };

  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function createDefaultSenderProfile(): SenderProfile {
  return {
    companyName: "",
    department: "",
    title: "",
    fullName: "",
    lastName: "",
    firstName: "",
    lastNameKana: "",
    firstNameKana: "",
    email: "",
    phone: "",
    postalCode: "",
    prefecture: "",
    city: "",
    address: "",
    building: "",
    subject: "",
    meetingUrl: "",
  };
}

function createEmptyCard(): CompanyCard {
  return {
    id: crypto.randomUUID(),
    companyName: "",
    contactName: "",
    department: "",
    title: "",
    email: "",
    homepageUrl: "",
    notes: "",
    generatedMessage: "",
    status: "pending",
    sendEnabled: true,
  };
}

function sanitize(value: unknown): string {
  if (typeof value === "number") return String(value).trim();
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeHomepageUrl(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function readSheetRows(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const isCSV = file.name.toLowerCase().endsWith(".csv");

  // CSVの場合はエンコーディングを自動検出
  if (isCSV) {
    // まずUTF-8で試す
    let text = new TextDecoder("utf-8").decode(buffer);

    // 文字化けの兆候があればShift-JISで再デコード
    if (text.includes("�") || /[\x80-\x9F]/.test(text)) {
      try {
        text = new TextDecoder("shift-jis").decode(buffer);
      } catch {
        // shift-jisがサポートされていない場合はUTF-8のまま
      }
    }

    // CSVをパース
    const workbook = read(text, { type: "string" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("シートが見つかりません。");
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
    }) as string[][];
    return rows;
  }

  // Excel (.xlsx, .xls) の場合
  const workbook = read(buffer, { type: "array", codepage: 932 });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("シートが見つかりません。");
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
  }) as string[][];
  return rows;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function removeFromQueue(queue: string[], target: string): string[] {
  const index = queue.indexOf(target);
  if (index === -1) return queue;
  return [...queue.slice(0, index), ...queue.slice(index + 1)];
}

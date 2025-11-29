import { NextRequest, NextResponse } from 'next/server';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

type DownloadFormData = {
  formType: 'download';
  lastName: string;
  firstName: string;
  companyName: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  howDidYouHear: string;
  howDidYouHearOther?: string;
};

type DemoFormData = {
  formType: 'demo';
  lastName: string;
  firstName: string;
  companyName: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  employeeCount: string;
  serviceUrl: string;
  averageOrderValue: string;
  howDidYouHear: string;
  howDidYouHearOther?: string;
  expectedStartDate: string;
  content: string;
};

type FormData = DownloadFormData | DemoFormData;

function buildSlackMessage(data: FormData): object {
  const isDemo = data.formType === 'demo';
  const formTypeLabel = isDemo ? '🖥️ 無料デモ申し込み' : '📄 資料ダウンロード';
  const howDidYouHear = data.howDidYouHear === 'その他' && data.howDidYouHearOther 
    ? `その他: ${data.howDidYouHearOther}` 
    : data.howDidYouHear;

  const baseFields = [
    {
      type: 'mrkdwn',
      text: `*氏名*\n${data.lastName} ${data.firstName}`,
    },
    {
      type: 'mrkdwn',
      text: `*会社名*\n${data.companyName}`,
    },
    {
      type: 'mrkdwn',
      text: `*部署名*\n${data.department}`,
    },
    {
      type: 'mrkdwn',
      text: `*役職名*\n${data.position}`,
    },
    {
      type: 'mrkdwn',
      text: `*メールアドレス*\n${data.email}`,
    },
    {
      type: 'mrkdwn',
      text: `*電話番号*\n${data.phone}`,
    },
    {
      type: 'mrkdwn',
      text: `*認知経路*\n${howDidYouHear}`,
    },
  ];

  if (isDemo) {
    const demoData = data as DemoFormData;
    baseFields.push(
      {
        type: 'mrkdwn',
        text: `*従業員規模*\n${demoData.employeeCount}`,
      },
      {
        type: 'mrkdwn',
        text: `*対象サービスURL*\n${demoData.serviceUrl}`,
      },
      {
        type: 'mrkdwn',
        text: `*受注平均単価*\n${demoData.averageOrderValue}`,
      },
      {
        type: 'mrkdwn',
        text: `*利用開始想定時期*\n${demoData.expectedStartDate}`,
      }
    );
  }

  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${formTypeLabel}`,
        emoji: true,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      fields: baseFields.slice(0, 10), // Slackの制限: 1セクションに最大10フィールド
    },
  ];

  // 10フィールドを超える場合は追加セクションを作成
  if (baseFields.length > 10) {
    blocks.push({
      type: 'section',
      fields: baseFields.slice(10),
    });
  }

  // デモの場合はお問い合わせ背景を追加
  if (isDemo) {
    const demoData = data as DemoFormData;
    if (demoData.content) {
      blocks.push(
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*お問い合わせ背景(詳細)*\n${demoData.content}`,
          },
        }
      );
    }
  }

  // タイムスタンプを追加
  blocks.push(
    {
      type: 'divider',
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
        },
      ],
    }
  );

  return {
    blocks,
    text: `${formTypeLabel} - ${data.companyName} ${data.lastName}${data.firstName}様`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const data: FormData = await request.json();

    // バリデーション
    if (!data.lastName || !data.firstName || !data.companyName || !data.email) {
      return NextResponse.json(
        { message: '必須項目が入力されていません' },
        { status: 400 }
      );
    }

    // Slackに通知
    const slackMessage = buildSlackMessage(data);
    
    const slackResponse = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!slackResponse.ok) {
      console.error('Slack notification failed:', await slackResponse.text());
      // Slack通知が失敗してもユーザーにはエラーを返さない（ログのみ）
    }

    return NextResponse.json({ 
      success: true, 
      message: data.formType === 'demo' 
        ? 'デモ申し込みを受け付けました' 
        : '資料ダウンロードを受け付けました'
    });

  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      { message: '送信に失敗しました。しばらく経ってから再度お試しください。' },
      { status: 500 }
    );
  }
}

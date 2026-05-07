import { NextResponse } from "next/server";

const SHORT_CAPTION =
  "⚡ แจ้งงดจ่ายไฟชั่วคราว\nรายละเอียดพื้นที่และเวลาอยู่ในภาพประกาศด้านล่างครับ";

const ratioLabelToSize: Record<string, string> = {
  "16:9": "1600x900",
  "1:1": "1080x1080",
  "9:16": "1080x1920"
};

const buildPlaceholderImage = (jobId: string, ratio: string) => {
  const size = ratioLabelToSize[ratio] ?? ratioLabelToSize["16:9"];
  const text = encodeURIComponent(`OUTAGE POSTER\nJOB ${jobId}\nRATIO ${ratio}`);
  return `https://dummyimage.com/${size}/6d28d9/fbbf24.png&text=${text}`;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  const ratio = typeof body?.ratio === "string" ? body.ratio : "16:9";

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const baseImage = buildPlaceholderImage(jobId, ratio);

  return NextResponse.json({
    imageUrl: baseImage,
    captionShort: SHORT_CAPTION,
    variants: {
      facebook: buildPlaceholderImage(jobId, "16:9"),
      line: buildPlaceholderImage(jobId, "1:1"),
      story: buildPlaceholderImage(jobId, "9:16")
    }
  });
}

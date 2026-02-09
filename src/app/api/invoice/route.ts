import { NextResponse } from "next/server";

// 財政部統一發票中獎號碼 XML 來源
const XML_URL = "https://invoice.etax.nat.gov.tw/invoice.xml";

export async function GET() {
  try {
    const response = await fetch(XML_URL, {
      headers: {
        Accept: "application/xml, text/xml, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();

    return new NextResponse(xmlText, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
      },
    });
  } catch (error) {
    console.error("Error fetching invoice XML:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice data" },
      { status: 500 }
    );
  }
}

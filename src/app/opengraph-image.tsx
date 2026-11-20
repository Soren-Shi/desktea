import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "DeskTea — Secret Desk Group Chat";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          backgroundColor: "#0A0A0A",
          color: "#FAFAFA",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Left Editorial Pitch */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "520px",
            height: "518px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "#151518",
                border: "1px solid #2A2C32",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: 700,
                color: "#FAFAFA",
              }}
            >
              D
            </div>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#FAFAFA",
              }}
            >
              DeskTea
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: "52px",
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                color: "#FAFAFA",
              }}
            >
              <span>Snap your desk.</span>
              <span style={{ color: "#8A8F98" }}>Overhear their</span>
              <span>group chat.</span>
            </div>
            <div
              style={{
                fontSize: "21px",
                lineHeight: 1.45,
                color: "#8A8F98",
              }}
            >
              AI crops every mug, keyboard, and plant into a cast avatar and
              leaks their secret chat roasting you behind your back.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FFFFFF",
                color: "#0A0A0A",
                borderRadius: "999px",
                padding: "14px 28px",
                fontSize: "19px",
                fontWeight: 700,
              }}
            >
              Try with your desk →
            </div>
            <div
              style={{
                fontSize: "16px",
                color: "#5C6068",
              }}
            >
              Live Cam · @Mention · 16:9 X Card
            </div>
          </div>
        </div>

        {/* Right Obsidian Chat Card Mock */}
        <div
          style={{
            width: "520px",
            height: "518px",
            borderRadius: "28px",
            backgroundColor: "#141416",
            border: "1px solid #24262B",
            padding: "28px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #222428",
              paddingBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#FAFAFA",
                }}
              >
                Notion B-Roll Set Victims
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "#8A8F98",
                }}
              >
                6 desk items active · Secret roast
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "999px",
                backgroundColor: "#1B1C20",
                border: "1px solid #2A2C32",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#D9DBDF",
              }}
            >
              Tension 86%
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {/* Message 1 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#8A8F98",
                }}
              >
                Steel Water Flask · 16:09
              </div>
              <div
                style={{
                  display: "flex",
                  backgroundColor: "#1A1B1F",
                  border: "1px solid #25272C",
                  borderRadius: "18px",
                  padding: "12px 16px",
                  fontSize: "15px",
                  lineHeight: 1.45,
                  color: "#E4E6EB",
                }}
              >
                Checked me off on Notion twenty minutes ago yet zero sips were
                actually taken today.
              </div>
            </div>

            {/* Message 2 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#8A8F98",
                }}
              >
                Succulent Trio · 16:10
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  backgroundColor: "#1A1B1F",
                  border: "1px solid #25272C",
                  borderRadius: "18px",
                  padding: "12px 16px",
                  fontSize: "15px",
                  lineHeight: 1.45,
                  color: "#E4E6EB",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#FF5A4E",
                  }}
                >
                  @Steel Water Flask
                </div>
                <div>
                  At least you hold real water. We are three matching pots just
                  staged for camera bokeh.
                </div>
              </div>
            </div>

            {/* Message 3 - Owner */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#8A8F98",
                }}
              >
                You (Owner) · 01:16
              </div>
              <div
                style={{
                  display: "flex",
                  backgroundColor: "#FFFFFF",
                  color: "#0A0A0A",
                  borderRadius: "18px",
                  padding: "11px 18px",
                  fontSize: "15px",
                  fontWeight: 600,
                }}
              >
                Relax, I am cleaning this desk tomorrow for real.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: "999px",
              backgroundColor: "#191A1E",
              border: "1px solid #2A2C32",
              padding: "10px 18px",
              fontSize: "14px",
              color: "#6E737C",
            }}
          >
            <span>@ to mention any object on your desk...</span>
            <span style={{ color: "#FAFAFA", fontWeight: 600 }}>Roast</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

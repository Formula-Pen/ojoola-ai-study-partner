export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origin || "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY is not configured"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    try {
      const now = Date.now();

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": env.GEMINI_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            uses: 1,
            expireTime: new Date(
              now + 30 * 60 * 1000
            ).toISOString(),

            newSessionExpireTime: new Date(
              now + 60 * 1000
            ).toISOString(),

            liveConnectConstraints: {
              model: "models/gemini-3.8-live",

              config: {
                responseModalities: ["AUDIO"],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                sessionResumption: {}
              }
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error:
              data?.error?.message ||
              "Gemini token request failed"
          }),
          {
            status: response.status,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          token: data.name
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin || "*"
          }
        }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message || "Worker error"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};

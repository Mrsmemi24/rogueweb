import { auth } from "@/auth";
import { createSocketAccessToken } from "@/lib/socket-token";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const token = await createSocketAccessToken(session.user.id);

    return Response.json(
      { token, expiresIn: 60 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "Could not issue Socket.IO access token:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return Response.json(
      { error: "Socket authentication is not configured" },
      { status: 503 }
    );
  }
}

import { getEmployeeSession } from "@/lib/auth/employee-session";
import { getEmployeePortalContext } from "@/lib/directory/service";
import { listEmployeeRequests } from "@/lib/requests/service";

function encodeSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const session = await getEmployeeSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const context = await getEmployeePortalContext(session.employeeId);
  if (!context) {
    return new Response("Not found", { status: 404 });
  }

  let interval: NodeJS.Timeout | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const push = async () => {
        const items = await listEmployeeRequests(session, context.payroll.reference);
        controller.enqueue(
          new TextEncoder().encode(
            encodeSse({
              payrollReference: context.payroll.reference,
              items,
            }),
          ),
        );
      };

      await push();
      interval = setInterval(push, 25_000);
      heartbeat = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
      }, 10_000);

      controller.enqueue(
        new TextEncoder().encode(
          `event: ready\ndata: ${JSON.stringify({ ready: true })}\n\n`,
        ),
      );
    },
    cancel() {
      if (interval) clearInterval(interval);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

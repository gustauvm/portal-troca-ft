export async function POST() {
  return Response.json(
    { error: "Primeiro acesso por e-mail foi desativado. Use matrícula/RE e CPF." },
    { status: 410 },
  );
}

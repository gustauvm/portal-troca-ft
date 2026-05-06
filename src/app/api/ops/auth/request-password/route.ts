export async function POST() {
  return Response.json(
    { error: "Troca de senha por e-mail foi desativada. Use matrícula/RE e CPF." },
    { status: 410 },
  );
}

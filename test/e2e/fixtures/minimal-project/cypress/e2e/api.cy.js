describe("API de usuários", () => {
  it("rejeita payload sem e-mail e retorna 400", () => {
    cy.request({
      method: "POST",
      url: "/usuarios",
      body: { name: "João da Silva" },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "Deve retornar 400 sem e-mail").to.equal(400);
    });
  });

  it("retorna 200 para health check", () => {
    cy.request("/health").then((response) => {
      expect(response.status).to.equal(200);
    });
  });
});

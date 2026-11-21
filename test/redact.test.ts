import { describe, it, expect } from "vitest";
import { Redactor } from "../src/redact/index.js";

describe("Redactor: structured fields", () => {
  it("pseudonymizes person and company names consistently within a session", () => {
    const r = new Redactor();
    const out = r.redact({
      person: { firstName: "Erika", lastName: "Musterfrau" },
      roles: { customer: { number: 10308 } },
      id: "e9066f04-8cc7-4616-93f8-ac9ecc8479c8",
    }) as any;
    expect(out.person.firstName).not.toBe("Erika");
    expect(out.person.lastName).not.toBe("Musterfrau");
    expect(out.person.firstName).toMatch(/^Kontakt \d+$/);
    // the same input in a later call gets the same pseudonym
    const again = r.redact({ contactName: "Erika" }) as any;
    expect(again.contactName).toBe(out.person.firstName);
  });

  it("keeps non-personal fields such as numbers, ids, and amounts", () => {
    const r = new Redactor();
    const out = r.redact({
      id: "f3d3ae48-30d9-4b56-973a-b3159cbe743c",
      voucherNumber: "RE1012",
      totalAmount: 99.8,
      roles: { customer: { number: 10308 } },
    }) as any;
    expect(out).toEqual({
      id: "f3d3ae48-30d9-4b56-973a-b3159cbe743c",
      voucherNumber: "RE1012",
      totalAmount: 99.8,
      roles: { customer: { number: 10308 } },
    });
  });

  it("removes street, supplement and zip from address objects but keeps city", () => {
    const r = new Redactor();
    const out = r.redact({
      address: { name: "Bike & Ride GmbH", supplement: "Gebäude 10", street: "Musterstraße 42", zip: "79112", city: "Freiburg", countryCode: "DE" },
    }) as any;
    expect(out.address.street).toBe("[entfernt]");
    expect(out.address.supplement).toBe("[entfernt]");
    expect(out.address.zip).toBe("[entfernt]");
    expect(out.address.city).toBe("Freiburg");
    expect(out.address.countryCode).toBe("DE");
    expect(out.address.name).toMatch(/^Kontakt \d+$/);
  });

  it("removes tax identifiers by key", () => {
    const r = new Redactor();
    const out = r.redact({ taxNumber: "12/345/67890", vatRegistrationId: "DE123456789" }) as any;
    expect(out.taxNumber).toBe("[entfernt]");
    expect(out.vatRegistrationId).toBe("[entfernt]");
  });

  it("does not treat product names as persons", () => {
    const r = new Redactor();
    const out = r.redact({
      lineItems: [{ name: "Abus Kabelschloss Primo 590", quantity: 2 }],
    }) as any;
    expect(out.lineItems[0].name).toBe("Abus Kabelschloss Primo 590");
  });
});

describe("Redactor: free text", () => {
  it("masks e-mail addresses, IBANs, phone numbers, and USt-IdNr in any string", () => {
    const r = new Redactor();
    const out = r.redact({
      note: "Mail an erika@example.de, IBAN DE89 3704 0044 0532 0130 00, Tel. +49 761 123456, USt DE123456789",
    }) as any;
    expect(out.note).not.toContain("erika@example.de");
    expect(out.note).not.toContain("DE89 3704 0044 0532 0130 00");
    expect(out.note).not.toContain("+49 761 123456");
    expect(out.note).not.toContain("DE123456789");
    expect(out.note).toContain("[E-Mail]");
    expect(out.note).toContain("[IBAN]");
    expect(out.note).toContain("[Telefon]");
    expect(out.note).toContain("[USt-IdNr]");
  });

  it("leaves amounts and invoice numbers alone", () => {
    const r = new Redactor();
    const out = r.redact({ description: "Rechnung RE1019, Betrag 119,00 EUR, Lieferung am 2026-03-15" }) as any;
    expect(out.description).toBe("Rechnung RE1019, Betrag 119,00 EUR, Lieferung am 2026-03-15");
  });
});

describe("Redactor: arrays and nesting", () => {
  it("redacts inside arrays such as contactPersons and voucher lists", () => {
    const r = new Redactor();
    const out = r.redact({
      content: [
        { contactName: "Test GmbH", totalAmount: 498.8, openAmount: 498.8 },
        { contactName: "Test GmbH", totalAmount: 10 },
      ],
    }) as any;
    expect(out.content[0].contactName).toBe(out.content[1].contactName);
    expect(out.content[0].contactName).not.toBe("Test GmbH");
    expect(out.content[0].totalAmount).toBe(498.8);
  });
});

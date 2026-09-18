import { describe, expect, it } from '@jest/globals';

import {
  findSpeechNumberReplacements,
  type SpeechNumberLocale,
} from '../../../../src/core/speech/text-normalizer';

function spoken(source: string, locale: SpeechNumberLocale): string {
  const edits = findSpeechNumberReplacements(source, locale);
  let result = "";
  let cursor = 0;
  for (const edit of edits) {
    result += source.slice(cursor, edit.sourceStart) + edit.spokenText;
    cursor = edit.sourceEnd;
  }
  return result + source.slice(cursor);
}

describe("source-aligned speech number normalization", () => {
  it("speaks the reported English year and grouped result count", () => {
    const source =
      "In early 2022, the search returned over 91,000 unique results.";
    expect(spoken(source, "en")).toBe(
      "In early two thousand twenty-two, the search returned over ninety-one thousand unique results.",
    );
    expect(findSpeechNumberReplacements(source, "en")).toEqual([
      {
        sourceStart: 9,
        sourceEnd: 13,
        spokenText: "two thousand twenty-two",
        rule: "integer",
      },
      {
        sourceStart: 40,
        sourceEnd: 46,
        spokenText: "ninety-one thousand",
        rule: "integer",
      },
    ]);
  });

  it("normalizes canonical English decimals, percent, USD/EUR, and time", () => {
    expect(
      spoken("Revenue rose 12.5% to $1,234.50 at 16:16; €20 remained.", "en"),
    ).toBe(
      "Revenue rose twelve point five percent to one thousand two hundred thirty-four dollars and fifty cents at sixteen sixteen; twenty euros remained.",
    );
  });

  it("normalizes canonical pt-BR grouping, decimals, percent, BRL, and time", () => {
    expect(
      spoken(
        "Em 2022, foram 91.000 resultados; subiu 12,5% para R$ 1.234,50 às 16:16.",
        "pt-BR",
      ),
    ).toBe(
      "Em dois mil e vinte e dois, foram noventa e um mil resultados; subiu doze vírgula cinco por cento para mil duzentos e trinta e quatro reais e cinquenta centavos às dezesseis horas e dezesseis minutos.",
    );
  });

  it("leaves ambiguous or identifier-like forms unchanged", () => {
    const source =
      "Versions 2.4.1 and 192.168.0.1, IDs 007 and 1234567890, bad 12,34,567.";
    expect(spoken(source, "en")).toBe(source);
    expect(findSpeechNumberReplacements(source, "en")).toEqual([]);
  });

  it("does not consume letters around a number or the wrong locale grouping", () => {
    expect(spoken("A2022 B 1.234,50 C", "en")).toBe("A2022 B 1.234,50 C");
    expect(spoken("A2022 B 1,234.50 C", "pt-BR")).toBe("A2022 B 1,234.50 C");
  });

  it("emits ordered non-overlapping UTF-16 source ranges", () => {
    const source = "😀 2022 and $20";
    const edits = findSpeechNumberReplacements(source, "en");
    expect(
      edits.map((edit) => source.slice(edit.sourceStart, edit.sourceEnd)),
    ).toEqual(["2022", "$20"]);
    expect(edits[0]?.sourceStart).toBe(3);
    for (let index = 1; index < edits.length; index += 1) {
      expect(edits[index - 1].sourceEnd).toBeLessThanOrEqual(
        edits[index].sourceStart,
      );
    }
  });
});

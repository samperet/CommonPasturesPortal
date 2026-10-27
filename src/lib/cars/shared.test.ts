import { describe, expect, it } from "vitest";
import { describeCar, normalizePlate, parseCarRows } from "./shared";

describe("car registration", () => {
  it("keeps plates uppercase and tidy, and describes a car", () => {
    expect(normalizePlate(" abc-123 ")).toBe("ABC-123");
    expect(normalizePlate("gnu  4ever!")).toBe("GNU 4EVER");
    expect(describeCar({ colour: "Blue", year: "2019", make: "Subaru", model: "Outback" })).toBe(
      "Blue 2019 Subaru Outback"
    );
    expect(describeCar({ colour: "", year: null, make: "", model: "" })).toBe("");
  });

  it("reads rows pasted from a spreadsheet, by their column names", () => {
    const { rows, problems } = parseCarRows(
      "Unit\tOwner\tMake\tModel\tColor\tYear\tLicense Plate\tState\tNotes\n12\tAda Ash\tSubaru\tOutback\tBlue\t2019\tabc 123\tVT\tshed 4\n\t\t\t\t\t\t\t\t\n7\tBen Birch\t\tHonda Fit\tred\t\tXYZ-9\t\t\n3\t\tFord\tF-150\t\t20x\t\t\t"
    );
    expect(problems).toEqual(["Row 4: no plate"]);
    expect(rows).toEqual([
      {
        unit: 12,
        owner: "Ada Ash",
        make: "Subaru",
        model: "Outback",
        colour: "Blue",
        year: "2019",
        plate: "ABC 123",
        state: "VT",
        notes: "shed 4",
      },
      {
        unit: 7,
        owner: "Ben Birch",
        make: "Honda",
        model: "Fit",
        colour: "red",
        year: null,
        plate: "XYZ-9",
        state: null,
        notes: null,
      },
    ]);
  });

  it("reads comma-separated rows with quotes, and says what's missing", () => {
    const { rows } = parseCarRows(
      'plate,make,model,owner\n"ABC 123",Subaru,"Outback, wagon","Ash, Ada"\n'
    );
    expect(rows[0]).toMatchObject({
      plate: "ABC 123",
      model: "Outback, wagon",
      owner: "Ash, Ada",
      unit: null,
    });
    expect(parseCarRows("name,make\nAda,Subaru").problems).toEqual([
      "No plate column (named plate, license, registration or tag)",
    ]);
    expect(parseCarRows("").problems).toEqual(["Nothing to read"]);
  });
});

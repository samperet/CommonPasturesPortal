import type { EquipmentItem } from "./shared";

/**
 * The O&M circle's first piece of equipment, written into its list the first
 * time the list is read (`readEquipment`): the DR mower, with what the
 * community's mailing list said of it between February and August 2025.
 * This file is in a public repository, so it names no residents — the
 * owner, the volunteers and whoever looks after it are described, not named
 * — and the circle can add names, the model and serial number, and where
 * it's kept on its page.
 */

const FROM_THE_LIST = { userId: "", name: "From the community mailing list" };
const SEEDED_AT = "2026-11-15T12:00:00.000Z";

export const DR_MOWER_SEED: EquipmentItem = {
  id: "dr-mower",
  name: "DR mower",
  kind: "Walk-behind field and brush mower (a “brush hog”)",
  makeModel: "DR",
  serial: "",
  location: "",
  acquired:
    "Bought by a resident about 15 years ago and used to look after the community's land ever since, at little cost to the HOA.",
  owner:
    "A resident, who means to give it to the HOA — perhaps after the next budget cycle (as of August 2025).",
  keeper:
    "For now, the garden group: a resident has taken responsibility for it, with two helpers (since August 2025).",
  status: "in-service",
  notes: [
    "Volunteers are trained on it before they use it.",
    "",
    "What it mows:",
    "- paths around Mt Munson",
    "- paths around the pond, including along its west edge",
    "- paths through the field to the town link trail, by the south field",
    "- the orchard paths, and the whole orchard twice a year",
    "- the back field, south of the compost",
    "- around the burn pile and the community yard and garden waste pile",
    "- around the outside of the dog park, once or twice a year, to keep the fence in good condition",
    "- the sledding hill, once or twice a year, depending on growth",
    "- around the water building, as needed",
    "- around the Barnita, the CSA building and the hoophouse, now and then, to keep the buildings from deteriorating",
    "- the septic access area by the water building, once a year",
    "- the edges of the septic mounds, where the contract mower hasn't mowed them enough",
    "",
    "Using it on HOA property: $5 an hour, agreed with the HOA in 2013 and unchanged since. That covers fuel, not seasonal maintenance or repairs. The 2024 season's use came to $130.",
    "",
    "Money given beyond the July 2025 repair goes to its fuel and repairs.",
  ].join("\n"),
  createdAt: SEEDED_AT,
  createdBy: FROM_THE_LIST,
  updatedAt: SEEDED_AT,
  log: [
    {
      id: "2025-02-11-agenda",
      date: "2025-02-11",
      kind: "note",
      text: "On the Land Care meeting's agenda: the DR mower's use and storage.",
      by: FROM_THE_LIST,
      imported: true,
      createdAt: SEEDED_AT,
    },
    {
      id: "2025-04-24-paperwork",
      date: "2025-04-24",
      kind: "note",
      text: "On the Land Care meeting's agenda: handing in the paperwork for the community's DR mower use in 2024.",
      by: FROM_THE_LIST,
      imported: true,
      createdAt: SEEDED_AT,
    },
    {
      id: "2025-04-29-volunteers",
      date: "2025-04-29",
      kind: "note",
      text: "Land Care's minutes: last season two volunteers did most of the DR mowing, and they asked for one more person to join them — about 1.5 to 2 hours a month.",
      by: FROM_THE_LIST,
      imported: true,
      createdAt: SEEDED_AT,
    },
    {
      id: "2025-07-30-repair",
      date: "2025-07-30",
      kind: "repair",
      text: "An extensive repair, parts and labor. The HOA's budget had nothing set aside for it, so the community was asked to chip in to pay its owner back.",
      cost: 66749,
      by: FROM_THE_LIST,
      imported: true,
      createdAt: SEEDED_AT,
    },
    {
      id: "2025-08-17-repaid",
      date: "2025-08-17",
      kind: "note",
      text: "The repair was paid back by the community's donations. Anything more given goes to its fuel and repairs.",
      by: FROM_THE_LIST,
      imported: true,
      createdAt: SEEDED_AT,
    },
    {
      id: "2025-08-21-keeper",
      date: "2025-08-21",
      kind: "note",
      text: "Its owner means to give it to the HOA, perhaps after the next budget cycle. Until then the garden group keeps it: a resident has taken responsibility for it, with two helpers.",
      by: FROM_THE_LIST,
      imported: true,
      createdAt: SEEDED_AT,
    },
    {
      id: "2025-08-25-to-do",
      date: "2025-08-25",
      kind: "note",
      text: "Still to mow this season: the rest of the chicken field (its yearly DRing), the sled hill, around the well, and the parts of the septic fields the contract mower skipped. Whoever uses the DR should be trained first.",
      by: FROM_THE_LIST,
      imported: true,
      createdAt: SEEDED_AT,
    },
  ],
};

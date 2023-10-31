import { describe, expect, it } from "vitest";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";

import { buildDateRanges, processDateOverride, processWorkingHours, subtract } from "./date-ranges";

describe("processWorkingHours", () => {
  it("should return the correct working hours given a specific availability, timezone, and date range", () => {
    const item = {
      days: [1, 2, 3, 4, 5], // Monday to Friday
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    const timeZone = "America/New_York";
    const dateFrom = dayjs.utc().startOf("day").day(2).add(1, "week");
    const dateTo = dayjs.utc().endOf("day").day(3).add(1, "week");

    const results = processWorkingHours({ item, timeZone, dateFrom, dateTo });

    expect(results.length).toBe(2); // There should be two working days between the range

    const computeTimes = (date: Dayjs) => {
      const baseTime = dayjs.tz(`${date.format("YYYY-MM-DD")}T00:00:00Z`, timeZone);
      const offset = -baseTime.utcOffset() / 60;
      return {
        start: date.add(8 + offset, "hours").tz(timeZone),
        end: date.add(17 + offset, "hours").tz(timeZone),
      };
    };

    const dateFromTimes = computeTimes(dateFrom);
    const dateToTimes = computeTimes(dateTo.startOf("day"));

    expect(results[0]).toEqual(dateFromTimes);
    expect(results[1]).toEqual(dateToTimes);
  });
  it("should have availability on last day of month in the month were DST starts", () => {
    const item = {
      days: [0, 1, 2, 3, 4, 5, 6], // Monday to Sunday
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    const timeZone = "Europe/London";

    const dateFrom = dayjs().month(9).date(24); // starts before DST change
    const dateTo = dayjs().startOf("day").month(10).date(1); // first day of November

    const results = processWorkingHours({ item, timeZone, dateFrom, dateTo });

    const lastAvailableSlot = results[results.length - 1];

    expect(lastAvailableSlot.start.date()).toBe(31);
  });
  it("should return the correct working hours in the month were DST ends", () => {
    const item = {
      days: [0, 1, 2, 3, 4, 5, 6], // Monday to Sunday
      startTime: new Date(2023, 5, 12, 8, 0), // 8 AM
      endTime: new Date(2023, 5, 12, 17, 0), // 5 PM
    };

    console.log(item);

    // in America/New_York DST ends on first Sunday of November
    const timeZone = "America/New_York";

    let firstSundayOfNovember = dayjs.utc().startOf("day").month(10).date(1);
    while (firstSundayOfNovember.day() !== 0) {
      firstSundayOfNovember = firstSundayOfNovember.add(1, "day");
    }

    const dateFrom = dayjs.utc().month(10).date(1).startOf("day");
    const dateTo = dayjs.utc().month(10).endOf("month");

    const results = processWorkingHours({ item, timeZone, dateFrom, dateTo });

    const allDSTStartAt12 = results
      .filter((res) => res.start.isBefore(firstSundayOfNovember))
      .every((result) => result.start.utc().hour() === 11);
    const allNotDSTStartAt13 = results
      .filter((res) => res.start.isAfter(firstSundayOfNovember))
      .every((result) => result.start.utc().hour() === 12);

    expect(allDSTStartAt12).toBeTruthy();
    expect(allNotDSTStartAt13).toBeTruthy();
  });
});

describe("processDateOverrides", () => {
  it("should return the correct date override given a specific availability, timezone, and date", () => {
    const item = {
      date: new Date(Date.UTC(2023, 5, 12, 8, 0)),
      startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
      endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
    };

    // 2023-06-12T20:00:00-04:00 (America/New_York)
    const timeZone = "America/New_York";

    const result = processDateOverride({ item, timeZone });

    expect(result.start.format()).toEqual(dayjs("2023-06-12T12:00:00Z").tz(timeZone).format());
    expect(result.end.format()).toEqual(dayjs("2023-06-12T21:00:00Z").tz(timeZone).format());
  });
});

describe("buildDateRanges", () => {
  it("should return the correct date ranges", () => {
    const items = [
      {
        date: new Date(Date.UTC(2023, 5, 13)),
        startTime: new Date(Date.UTC(0, 0, 0, 10, 0)), // 10 AM
        endTime: new Date(Date.UTC(0, 0, 0, 15, 0)), // 3 PM
      },
      {
        days: [1, 2, 3, 4, 5],
        startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)), // 8 AM
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
      },
    ];

    const dateFrom = dayjs("2023-06-13T00:00:00Z"); // 2023-06-12T20:00:00-04:00 (America/New_York)
    const dateTo = dayjs("2023-06-15T00:00:00Z");

    const timeZone = "America/New_York";

    const results = buildDateRanges({ availability: items, timeZone, dateFrom, dateTo });
    // [
    //  { s: '2023-06-13T10:00:00-04:00', e: '2023-06-13T15:00:00-04:00' },
    //  { s: '2023-06-14T08:00:00-04:00', e: '2023-06-14T17:00:00-04:00' }
    // ]

    expect(results.length).toBe(2);

    expect(results[0]).toEqual({
      start: dayjs("2023-06-13T14:00:00Z").tz(timeZone),
      end: dayjs("2023-06-13T19:00:00Z").tz(timeZone),
    });

    expect(results[1]).toEqual({
      start: dayjs("2023-06-14T12:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T21:00:00Z").tz(timeZone),
    });
  });
  it("should handle day shifts correctly", () => {
    const item = [
      {
        date: new Date(Date.UTC(2023, 7, 15)),
        startTime: new Date(Date.UTC(2023, 5, 12, 9, 0)), // 9 AM
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)), // 5 PM
      },
      {
        date: new Date(Date.UTC(2023, 7, 15)),
        startTime: new Date(Date.UTC(2023, 5, 12, 19, 0)), // 7 PM
        endTime: new Date(Date.UTC(2023, 5, 12, 21, 0)), // 9 PM
      },
    ];

    const timeZone = "Pacific/Honolulu";

    const dateFrom = dayjs.tz("2023-08-15", "Europe/Brussels").startOf("day");
    const dateTo = dayjs.tz("2023-08-15", "Europe/Brussels").endOf("day");

    const result = buildDateRanges({ availability: item, timeZone, dateFrom, dateTo });
    // this happened only on Europe/Brussels, Europe/Amsterdam was 2023-08-15T17:00:00-10:00 (as it should be)
    expect(result[0].end.format()).not.toBe("2023-08-14T17:00:00-10:00");
  });
  it("should return correct date ranges with full day unavailable date override", () => {
    const items = [
      {
        date: new Date(Date.UTC(2023, 5, 13)),
        startTime: new Date(Date.UTC(0, 0, 0, 0, 0)),
        endTime: new Date(Date.UTC(0, 0, 0, 0, 0)),
      },
      {
        days: [1, 2, 3, 4, 5],
        startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)),
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)),
      },
    ];
    const timeZone = "Europe/London";

    const dateFrom = dayjs("2023-06-13T00:00:00Z");
    const dateTo = dayjs("2023-06-15T00:00:00Z");

    const results = buildDateRanges({ availability: items, timeZone, dateFrom, dateTo });

    expect(results[0]).toEqual({
      start: dayjs("2023-06-14T07:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T16:00:00Z").tz(timeZone),
    });
  });
  it("should return correct date ranges if date override would already already be the next day in utc timezone", () => {
    const items = [
      {
        date: new Date(Date.UTC(2023, 5, 13)),
        startTime: new Date(Date.UTC(0, 0, 0, 22, 0)),
        endTime: new Date(Date.UTC(0, 0, 0, 23, 0)),
      },
      {
        days: [1, 2, 3, 4, 5],
        startTime: new Date(Date.UTC(2023, 5, 12, 8, 0)),
        endTime: new Date(Date.UTC(2023, 5, 12, 17, 0)),
      },
    ];
    const timeZone = "America/New_York";

    const dateFrom = dayjs("2023-06-13T00:00:00Z");
    const dateTo = dayjs("2023-06-15T00:00:00Z");

    const results = buildDateRanges({ availability: items, timeZone, dateFrom, dateTo });

    expect(results[0]).toEqual({
      start: dayjs("2023-06-14T02:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T03:00:00Z").tz(timeZone),
    });
    expect(results[1]).toEqual({
      start: dayjs("2023-06-14T12:00:00Z").tz(timeZone),
      end: dayjs("2023-06-14T21:00:00Z").tz(timeZone),
    });
  });
});

describe("subtract", () => {
  it("subtracts appropriately when excluded ranges are given in order", () => {
    const data = {
      sourceRanges: [
        { start: dayjs.utc("2023-07-05T04:00:00.000Z"), end: dayjs.utc("2023-07-05T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-06T04:00:00.000Z"), end: dayjs.utc("2023-07-06T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-07T04:00:00.000Z"), end: dayjs.utc("2023-07-07T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-10T04:00:00.000Z"), end: dayjs.utc("2023-07-10T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-11T04:00:00.000Z"), end: dayjs.utc("2023-07-11T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-12T04:00:00.000Z"), end: dayjs.utc("2023-07-12T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-13T04:00:00.000Z"), end: dayjs.utc("2023-07-13T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-14T04:00:00.000Z"), end: dayjs.utc("2023-07-14T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-17T04:00:00.000Z"), end: dayjs.utc("2023-07-17T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-18T04:00:00.000Z"), end: dayjs.utc("2023-07-18T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-19T04:00:00.000Z"), end: dayjs.utc("2023-07-19T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-20T04:00:00.000Z"), end: dayjs.utc("2023-07-20T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-21T04:00:00.000Z"), end: dayjs.utc("2023-07-21T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-24T04:00:00.000Z"), end: dayjs.utc("2023-07-24T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-25T04:00:00.000Z"), end: dayjs.utc("2023-07-25T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-26T04:00:00.000Z"), end: dayjs.utc("2023-07-26T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-27T04:00:00.000Z"), end: dayjs.utc("2023-07-27T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-28T04:00:00.000Z"), end: dayjs.utc("2023-07-28T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-31T04:00:00.000Z"), end: dayjs.utc("2023-07-31T12:00:00.000Z") },
      ],
      excludedRanges: [
        { start: dayjs.utc("2023-07-05T04:00:00.000Z"), end: dayjs.utc("2023-07-05T04:15:00.000Z") },
        { start: dayjs.utc("2023-07-05T04:45:00.000Z"), end: dayjs.utc("2023-07-05T05:00:00.000Z") },
      ],
    };

    const result = subtract(data["sourceRanges"], data["excludedRanges"]).map((range) => ({
      start: range.start.format(),
      end: range.end.format(),
    }));

    expect(result).toEqual(
      expect.arrayContaining([
        { start: "2023-07-05T04:15:00Z", end: "2023-07-05T04:45:00Z" },
        { start: "2023-07-05T05:00:00Z", end: "2023-07-05T12:00:00Z" },
      ])
    );
  });

  it("subtracts appropriately when excluded ranges are not given in order", () => {
    const data = {
      sourceRanges: [
        { start: dayjs.utc("2023-07-05T04:00:00.000Z"), end: dayjs.utc("2023-07-05T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-06T04:00:00.000Z"), end: dayjs.utc("2023-07-06T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-07T04:00:00.000Z"), end: dayjs.utc("2023-07-07T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-10T04:00:00.000Z"), end: dayjs.utc("2023-07-10T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-11T04:00:00.000Z"), end: dayjs.utc("2023-07-11T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-12T04:00:00.000Z"), end: dayjs.utc("2023-07-12T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-13T04:00:00.000Z"), end: dayjs.utc("2023-07-13T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-14T04:00:00.000Z"), end: dayjs.utc("2023-07-14T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-17T04:00:00.000Z"), end: dayjs.utc("2023-07-17T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-18T04:00:00.000Z"), end: dayjs.utc("2023-07-18T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-19T04:00:00.000Z"), end: dayjs.utc("2023-07-19T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-20T04:00:00.000Z"), end: dayjs.utc("2023-07-20T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-21T04:00:00.000Z"), end: dayjs.utc("2023-07-21T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-24T04:00:00.000Z"), end: dayjs.utc("2023-07-24T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-25T04:00:00.000Z"), end: dayjs.utc("2023-07-25T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-26T04:00:00.000Z"), end: dayjs.utc("2023-07-26T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-27T04:00:00.000Z"), end: dayjs.utc("2023-07-27T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-28T04:00:00.000Z"), end: dayjs.utc("2023-07-28T12:00:00.000Z") },
        { start: dayjs.utc("2023-07-31T04:00:00.000Z"), end: dayjs.utc("2023-07-31T12:00:00.000Z") },
      ],
      excludedRanges: [
        { start: dayjs.utc("2023-07-05T04:45:00.000Z"), end: dayjs.utc("2023-07-05T05:00:00.000Z") },
        { start: dayjs.utc("2023-07-05T04:00:00.000Z"), end: dayjs.utc("2023-07-05T04:15:00.000Z") },
      ],
    };

    const result = subtract(data["sourceRanges"], data["excludedRanges"]).map((range) => ({
      start: range.start.format(),
      end: range.end.format(),
    }));

    expect(result).toEqual(
      expect.arrayContaining([
        { start: "2023-07-05T04:15:00Z", end: "2023-07-05T04:45:00Z" },
        { start: "2023-07-05T05:00:00Z", end: "2023-07-05T12:00:00Z" },
      ])
    );
  });
});

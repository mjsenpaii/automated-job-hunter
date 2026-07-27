/**
 * Versioned Philippine national-government salary schedules.
 *
 * Source: Department of Budget and Management, National Budget Circular
 * No. 601, Annex A, effective January 1, 2026.
 *
 * The source PDF is deliberately not fetched at runtime. Values are committed
 * here only after verification against the official Annex A table.
 */

export interface GovernmentSalaryScheduleMetadata {
  circularNumber: string;
  scheduleYear: number;
  effectiveDate: string;
  sourceTitle: string;
  sourceReference: string;
  sourceUrl: string;
}

export interface GovernmentSalarySchedule {
  metadata: GovernmentSalaryScheduleMetadata;
  grades: Readonly<Record<number, readonly (number | null)[]>>;
}

const STEP_1 = [
  14_634, 15_522, 16_486, 17_506, 18_581, 19_716, 20_914, 22_423,
  24_329, 26_917, 31_705, 33_947, 36_125, 38_764, 42_178, 45_694,
  49_562, 53_818, 59_153, 66_052, 73_303, 81_796, 91_306, 102_603,
  116_643, 131_807, 148_940, 167_129, 187_531, 210_718, 300_961,
  356_237, 449_157,
] as const;

const STEP_2 = [
  14_730, 15_636, 16_610, 17_636, 18_720, 19_862, 21_069, 22_627,
  24_523, 27_131, 31_820, 34_069, 36_283, 39_141, 42_594, 46_152,
  50_066, 54_371, 59_966, 66_970, 74_337, 82_963, 92_622, 104_209,
  118_469, 133_870, 151_273, 169_752, 190_482, 214_038, 306_691,
  363_257, 462_329,
] as const;

const STEP_3 = [
  14_849, 15_752, 16_732, 17_767, 18_858, 20_009, 21_224, 22_832,
  24_720, 27_347, 32_109, 34_357, 36_599, 39_523, 43_015, 46_615,
  50_576, 54_933, 60_793, 67_904, 75_388, 84_151, 93_962, 105_841,
  120_326, 135_968, 153_644, 172_418, 193_480, 217_207, 312_532,
  370_418, null,
] as const;

const STEP_4 = [
  14_968, 15_869, 16_856, 17_898, 18_998, 20_158, 21_382, 23_038,
  24_917, 27_565, 32_401, 34_648, 36_919, 39_910, 43_442, 47_084,
  51_092, 55_499, 61_632, 68_853, 76_456, 85_356, 95_330, 107_500,
  122_212, 138_100, 155_906, 174_797, 196_528, 220_425, 318_182,
  377_359, null,
] as const;

const STEP_5 = [
  15_089, 15_986, 16_982, 18_031, 19_137, 20_307, 21_539, 23_246,
  25_117, 27_786, 32_697, 34_943, 37_244, 40_300, 43_874, 47_559,
  51_614, 56_075, 62_486, 69_818, 77_542, 86_582, 96_823, 109_185,
  124_131, 140_268, 158_353, 177_545, 199_624, 223_691, 323_938,
  384_805, null,
] as const;

const STEP_6 = [
  15_211, 16_103, 17_106, 18_163, 19_280, 20_456, 21_699, 23_456,
  25_318, 28_007, 32_998, 35_242, 37_572, 40_696, 44_310, 48_040,
  52_144, 56_657, 63_353, 70_772, 78_645, 87_746, 98_341, 110_898,
  126_079, 142_469, 160_235, 180_339, 202_005, 227_224, 329_989,
  392_400, null,
] as const;

const STEP_7 = [
  15_333, 16_223, 17_234, 18_298, 19_423, 20_609, 21_859, 23_668,
  25_521, 28_230, 33_302, 35_544, 37_904, 41_097, 44_753, 48_528,
  52_678, 57_246, 64_236, 71_727, 79_692, 89_011, 99_883, 112_533,
  128_061, 144_707, 162_752, 182_660, 205_191, 230_595, 336_092,
  400_150, null,
] as const;

const STEP_8 = [
  15_456, 16_342, 17_360, 18_433, 19_565, 20_761, 22_022, 23_883,
  25_725, 28_456, 33_611, 35_850, 38_241, 41_503, 45_202, 49_020,
  53_221, 57_842, 65_132, 72_671, 80_831, 90_295, 101_318, 114_301,
  130_073, 146_983, 165_310, 185_537, 208_430, 234_240, 342_310,
  408_055, null,
] as const;

const STEP_COLUMNS: readonly (readonly (number | null)[])[] = [
  STEP_1,
  STEP_2,
  STEP_3,
  STEP_4,
  STEP_5,
  STEP_6,
  STEP_7,
  STEP_8,
];

function buildGrades(): Readonly<Record<number, readonly (number | null)[]>> {
  if (STEP_COLUMNS.some((column) => column.length !== 33)) {
    throw new Error('The committed 2026 DBM salary schedule is incomplete.');
  }

  const grades: Record<number, readonly (number | null)[]> = {};
  for (let grade = 1; grade <= 33; grade += 1) {
    grades[grade] = STEP_COLUMNS.map((column) => {
      const value = column[grade - 1];
      if (value === undefined) {
        throw new Error(`Missing DBM schedule value for Salary Grade ${grade}.`);
      }
      return value;
    });
  }
  return Object.freeze(grades);
}

export const PH_NATIONAL_SALARY_SCHEDULE_2026: GovernmentSalarySchedule =
  Object.freeze({
    metadata: Object.freeze({
      circularNumber: 'National Budget Circular No. 601',
      scheduleYear: 2026,
      effectiveDate: '2026-01-01',
      sourceTitle:
        'The Third Tranche Monthly Salary Schedule for the Civilian Personnel of the National Government, Effective January 1, 2026',
      sourceReference: 'DBM National Budget Circular No. 601, Annex A',
      sourceUrl:
        'https://www.dbm.gov.ph/wp-content/uploads/Issuances/2026/National-Budget-Circular/NATIONAL-BUDGET-CIRCULAR-NO.-601_NEW.pdf',
    }),
    grades: buildGrades(),
  });

export const PH_NATIONAL_SALARY_SCHEDULES: Readonly<
  Record<number, GovernmentSalarySchedule>
> = Object.freeze({
  2026: PH_NATIONAL_SALARY_SCHEDULE_2026,
});

export function getPhilippineNationalSalarySchedule(
  year: number,
): GovernmentSalarySchedule | null {
  return PH_NATIONAL_SALARY_SCHEDULES[year] ?? null;
}

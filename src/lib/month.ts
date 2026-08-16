const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function isCalendarMonth(value: string): boolean {
	const match = MONTH_PATTERN.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	return year >= 1001 && year <= 9998 && month >= 1 && month <= 12;
}

export function shiftCalendarMonth(value: string, amount: number): string {
	if (!isCalendarMonth(value) || !Number.isInteger(amount)) throw new Error("Invalid calendar month shift.");
	const [year, month] = value.split("-").map(Number);
	const monthIndex = year * 12 + month - 1 + amount;
	const shiftedYear = Math.floor(monthIndex / 12);
	const shiftedMonth = (monthIndex % 12) + 1;
	if (shiftedYear < 1 || shiftedYear > 9999) throw new Error("Calendar month is outside the supported range.");
	return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}`;
}

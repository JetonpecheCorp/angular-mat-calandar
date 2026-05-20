export type DateSpecialEvent =
{
    title: string,
    dateStart: {
        /** 1 => january, 12 => december */
        month: number,
        day: number
    },
    dateEnd: {
        /** 1 => january, 12 => december */
        month: number,
        day: number
    }
}
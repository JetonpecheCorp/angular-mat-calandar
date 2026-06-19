import { DateSpecialEvent } from "./DateSpecialEvent"
import { EventCalandar } from "./EventCalandar"

export type DateCalendrier =
{
    date: Date,
    isLocked: boolean,
    isToday: boolean,
    isWeekend: boolean,
    eventList: EventCalandar[],
    specialEventList: DateSpecialEvent[],
    estMoisCourant: boolean
}

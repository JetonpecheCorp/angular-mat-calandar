import { DateSpecialEvent } from "./DateSpecialEvent"
import { EventCalandar } from "./EventCalandar"

export type DateCalendrier =
{
    date: Date,
    estBloquer: boolean,
    estAujourdhui: boolean,
    estMoisCourant: boolean,
    estWeekend: boolean,
    listeEvent: EventCalandar[],
    listeEventSpecial: DateSpecialEvent[]
}
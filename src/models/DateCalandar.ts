import { EventCalandar } from "./EventCalandar"

export type DateCalendrier =
{
    date: Date,
    estAujourdhui: boolean,
    estMoisCourant: boolean,
    estWeekend: boolean,
    listeEvent: EventCalandar[]
}
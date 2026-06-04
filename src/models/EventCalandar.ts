export type EventCalandar = 
{
    id: string | number,
    groupEventId?: string | number,
    startDate: Date,
    endDate: Date,
    titre: string,
    description: string | null,
    readonly?: boolean
}

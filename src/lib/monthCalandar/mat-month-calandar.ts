import { booleanAttribute, Component, computed, input, model, output, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventCalandar } from '../../models/EventCalandar';
import { DateCalendrier } from '../../models/DateCalandar';
import { DatePipe } from '@angular/common';
import {MatRippleModule} from '@angular/material/core';

@Component({
  selector: 'jp-mat-month-calandar',
  imports: [MatRippleModule, DatePipe, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './mat-month-calandar.html',
  styleUrl: './mat-month-calandar.css',
})
export class MatMonthCalandar
{
    protected overrideRipple = signal(false);
    matRippleDisabled = input<boolean>(false);
    events = input<EventCalandar[]>();
    mois = model.required<number>({ alias: "month" });
    annee = model.required<number>({ alias: "year" });
    weekendDisabled = input(true, { transform: booleanAttribute });

    eventClickJour = output<DateCalendrier>({ alias: "dayClicked" });
    eventClickEvent = output<EventCalandar>({ alias: "eventClicked" });

    private readonly langueNavigateur = navigator.language || "fr-FR";

    protected nomMois = computed(() =>
    {
        const DATE = new Date(this.annee(), this.mois() - 1, 1);
        return new Intl.DateTimeFormat(this.langueNavigateur, { month: 'long' }).format(DATE);
    });

    protected listeDate = computed(() =>
    {
        let dateFinMois = new Date();

        dateFinMois.setMonth(this.mois());
        dateFinMois.setFullYear(this.annee());
        dateFinMois.setDate(0);

        if(dateFinMois.getMonth() == 11)
            dateFinMois.setFullYear(this.annee());

        let dateDebut = new Date(this.annee(), this.mois() - 1, 1);

        return this.Generer(dateDebut, dateFinMois);
    });

    protected listeNomSemaine = computed(() =>
    {
        this.listeDate();

        const DATE = new Date();
        const DATE_DEBUT_SEMAINE = DATE.getDate() - DATE.getDay();
        
        const shortFormatter = new Intl.DateTimeFormat(this.langueNavigateur, { weekday: 'short' });
        const longFormatter = new Intl.DateTimeFormat(this.langueNavigateur, { weekday: 'long' });

        return Array.from({ length: 7 }, (_, i) => 
        {
            const date = new Date(DATE.getFullYear(), DATE.getMonth(), DATE_DEBUT_SEMAINE + i);

            return {
                reduit: shortFormatter.format(date).toLowerCase().replace('.', ''),
                normal: longFormatter.format(date).toLowerCase()
            };
        });
    });

    protected Precedent(): void
    {
        this.mois.update(x => x == 1 ? 12 : x - 1);
        this.annee.update(x => this.mois() == 12 ? x - 1 : x);
    }

    protected Suivant(): void
    {
        this.mois.update(x => x == 12 ? 1 : x + 1);
        this.annee.update(x => this.mois() == 1 ? x + 1 : x);
    }

    protected ClickJour(_dateCalandrier: DateCalendrier): void
    {
        this.eventClickJour.emit(_dateCalandrier);
    }

    protected ClickEvent(_event: EventCalandar): void
    {
        this.eventClickEvent.emit(_event);
    }

    private Generer(_de: Date, _a: Date): DateCalendrier[]
    {
        const DATE_DEBUT = new Date(_de.getFullYear(), _de.getMonth(), 1);
        const DATE_FIN = _a; 

        DATE_DEBUT.setDate(DATE_DEBUT.getDate() - DATE_DEBUT.getDay()); 
    
        const DIFF_TEMPS = Math.abs(DATE_FIN.getTime() - DATE_DEBUT.getTime());
        const NB_JOUR_DIFF = Math.floor(DIFF_TEMPS / 86_400_000);  
    
        let liste: DateCalendrier[] = [];

        for (let i = 0; i <= NB_JOUR_DIFF; i++)
        {
            let date = new Date(DATE_DEBUT);
            date.setDate(date.getDate() + i);

            let listeDateInterval = this.events()?.filter(x => this.EstDansIntervalle(date, x.startDate, x.endDate)) ?? [];

            liste.push({
                date,
                estAujourdhui: this.EstDateJour(date),
                estMoisCourant: date.getMonth() === _de.getMonth(),
                estWeekend: date.getDay() == 0 || date.getDay() == 6,
                listeEvent: listeDateInterval
            });
        }
        
        return liste;
    }

    private EstDansIntervalle(_dateAChecker: Date, _debut: Date, _fin: Date): boolean
    {
        const DATE = new Date(_dateAChecker.getFullYear(), _dateAChecker.getMonth(), _dateAChecker.getDate()).getTime();
        const DEBUT = new Date(_debut.getFullYear(), _debut.getMonth(), _debut.getDate()).getTime();
        const FIN = new Date(_fin.getFullYear(), _fin.getMonth(), _fin.getDate()).getTime();

        return DATE >= DEBUT && DATE <= FIN;
    }

    private EstDateJour(_date: Date): boolean
    {
        const DATE_JOUR = new Date();

        return _date.getDate() === DATE_JOUR.getDate() &&
            _date.getMonth() === DATE_JOUR.getMonth() &&
            _date.getFullYear() === DATE_JOUR.getFullYear();
    }
}

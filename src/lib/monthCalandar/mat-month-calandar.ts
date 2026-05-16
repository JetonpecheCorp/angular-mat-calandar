import { booleanAttribute, Component, computed, input, model, OnInit, output, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventCalandar } from '../../models/EventCalandar';
import { DateCalendrier } from '../../models/DateCalandar';
import { DatePipe } from '@angular/common';
import {MatRippleModule} from '@angular/material/core';
import {MatMenuModule} from '@angular/material/menu';

@Component({
  selector: 'jp-mat-month-calandar',
  imports: [MatMenuModule, MatRippleModule, DatePipe, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './mat-month-calandar.html',
  styleUrl: './mat-month-calandar.css',
})
export class MatMonthCalandar implements OnInit
{
    matRippleDisabled = input<boolean>(false);
    events = input<EventCalandar[]>();
    mois = model.required<number>({ alias: "month" });
    annee = model.required<number>({ alias: "year" });
    weekendDisabled = input(false, { transform: booleanAttribute });
    mondayFirst = input(false, { transform: booleanAttribute });

    /**
     * 0 => Sunday, 6 => Monday
     */
    daysDisabled = input<number[]>([]);
    monthsDisabled = input<number[]>([]);

    eventClickJour = output<DateCalendrier>({ alias: "dayClicked" });
    eventClickEvent = output<EventCalandar>({ alias: "eventClicked" });

    protected overrideRipple = signal(false);
    protected texteEventPlus = signal<string>("one more");

    private readonly langueNavigateur = navigator.language || "fr-FR";

    protected nomMois = computed(() =>
    {
        const DATE = new Date(this.annee(), this.mois() - 1, 1);
        return new Intl.DateTimeFormat(this.langueNavigateur, { month: 'long' }).format(DATE);
    });

    protected nbColonnes = computed(() => 7 - this.joursAExclure().length);

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
        let liste = [];

        // debuter par lundi ou dimanche ?
        const JOUR_DEBUT = this.mondayFirst() ? 5 : 4; 
        const DATE_REF = new Date(2025, 4, JOUR_DEBUT); 
        
        const shortFormatter = new Intl.DateTimeFormat(this.langueNavigateur, { weekday: 'short' });
        const longFormatter = new Intl.DateTimeFormat(this.langueNavigateur, { weekday: 'long' });

        for (let i = 0; i < 7; i++) 
        {
            const dateTest = new Date(DATE_REF);
            dateTest.setDate(DATE_REF.getDate() + i);
            const dayIndex = dateTest.getDay();

            if (this.joursAExclure().includes(dayIndex)) 
                continue;

            liste.push({
                index: dayIndex,
                reduit: shortFormatter.format(dateTest).toLowerCase().replace('.', ''),
                normal: longFormatter.format(dateTest).toLowerCase()
            });
        }

        return liste;
    });

    protected listeMoisTraduit = computed(() => 
    {
        const FORMATEUR = new Intl.DateTimeFormat(this.langueNavigateur, { month: 'long' });
        
        return Array.from({ length: 12 }, (_, i) => 
        {
            return {
                id: i + 1,
                nom: FORMATEUR.format(new Date(2024, i, 1))
            };
        })
        .filter(x => !this.monthsDisabled().includes(x.id));
    });

    protected listeAnnee = computed(() => 
    {
        const ANNEE_REFERENCE = this.annee();

        const ANNEE_DEBUT = ANNEE_REFERENCE - 50;
        const ANNEE_FIN = ANNEE_REFERENCE + 50;
        
        return Array.from({ length: (ANNEE_FIN - ANNEE_DEBUT) + 1 }, (_, i) => ANNEE_DEBUT + i);
    });

    private joursAExclure = computed(() => 
    {
        const A_MASQUER = new Set(this.daysDisabled());

        if (this.weekendDisabled())
        {
            A_MASQUER.add(0);
            A_MASQUER.add(6);
        }

        return Array.from(A_MASQUER);
    });

    ngOnInit(): void 
    {
        const LANGUE = this.langueNavigateur.split('-')[0];
        
        const DICT_TRADUCTION: Record<string, string> = 
        {
            'fr': 'de plus',
            'it': 'in più',
            'de': 'mehr',
            'es': 'más',
            'pt': 'mais',
            'en': 'more'
        };

        const texte = DICT_TRADUCTION[LANGUE] || DICT_TRADUCTION['en'];
        this.texteEventPlus.set(texte);
    }

    protected Precedent(): void 
    {
        let nouveauMois = this.mois() == 1 ? 12 : this.mois() - 1;
        let nouvelleAnnee = this.mois() === 1 ? this.annee() - 1 : this.annee();

        // on continue de reculer quand que le mois est désactivé
        while (this.monthsDisabled().includes(nouveauMois)) 
        {
            nouveauMois = nouveauMois == 1 ? 12 : nouveauMois - 1;

            if (nouveauMois == 12) 
                nouvelleAnnee--;
        }

        this.annee.set(nouvelleAnnee);
        this.mois.set(nouveauMois);
    }

    protected Suivant(): void 
    {
        let nouveauMois = this.mois() == 12 ? 1 : this.mois() + 1;
        let nouvelleAnnee = this.mois() == 12 ? this.annee() + 1 : this.annee();

        // on continue d'avancer quand que le mois est désactivé
        while (this.monthsDisabled().includes(nouveauMois)) 
        {
            nouveauMois = nouveauMois == 12 ? 1 : nouveauMois + 1;
            if (nouveauMois == 1) 
                nouvelleAnnee++;
        }

        this.annee.set(nouvelleAnnee);
        this.mois.set(nouveauMois);
    }

    protected AllerAujourdhui(): void 
    {
        let dateJour = new Date();
        this.mois.set(dateJour.getMonth() + 1);
        this.annee.set(dateJour.getFullYear());
    }

    protected ChangerMois(_numeroMois: number): void
    {
        this.mois.set(_numeroMois);
    }

    protected changerAnnee(_annee: number): void
    {
        this.annee.set(_annee);
    }

    protected ClickJour(_dateCalandrier: DateCalendrier): void
    {
        console.log("jour");
        
        this.eventClickJour.emit(_dateCalandrier);
    }

    protected ClickEvent(_event: EventCalandar): void
    {
        console.log("event");
        
        this.eventClickEvent.emit(_event);
    }

    private Generer(_de: Date, _a: Date): DateCalendrier[] 
    {
        const DATE_DEBUT = new Date(_de.getFullYear(), _de.getMonth(), 1);
        const JOUR_SEMAINE = DATE_DEBUT.getDay();

        let offset: number = JOUR_SEMAINE;

        if (this.mondayFirst()) 
            offset = JOUR_SEMAINE === 0 ? 6 : JOUR_SEMAINE - 1;
        
        DATE_DEBUT.setDate(DATE_DEBUT.getDate() - offset); 

        let liste: DateCalendrier[] = [];

        for (let i = 0; i < 42; i++) 
        {
            let date = new Date(DATE_DEBUT);
            date.setDate(date.getDate() + i);

            if (this.joursAExclure().includes(date.getDay())) 
                continue;

            let listeDateInterval = this.events()?.filter(x => this.EstDansIntervalle(date, x.startDate, x.endDate)) ?? [];

            liste.push({
                date,
                estAujourdhui: this.EstDateJour(date),
                estMoisCourant: date.getMonth() === _de.getMonth(),
                estWeekend: date.getDay() === 0 || date.getDay() === 6,
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

import { booleanAttribute, ChangeDetectionStrategy, Component, computed, HostListener, input, model, OnInit, output, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventCalandar } from '../../models/EventCalandar';
import { DateCalendrier } from '../../models/DateCalandar';
import { DatePipe } from '@angular/common';
import {MatRippleModule} from '@angular/material/core';
import {MatMenuModule} from '@angular/material/menu';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { DateSpecialEvent } from '../../public-api';
import { DateInterval } from '../../models/DateInterval';
import { DateCalandarDisabled } from '../../models/DateCalandarDisabled';

interface EventPositionne {
    event: EventCalandar;
    jourDebutIndex: number; /* de 0 à (nbColonnes - 1) */
    dureeJours: number;
    ligne: number;          /* Position verticale (0, 1, 2...) */
}

interface SemaineCalendrier {
    jours: DateCalendrier[];
    eventsPositionnes: EventPositionne[];
}

@Component({
  selector: 'jp-mat-month-calandar',
  imports: [DragDropModule, MatMenuModule, MatRippleModule, DatePipe, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './mat-month-calandar.html',
  styleUrl: './mat-month-calandar.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatMonthCalandar implements OnInit
{
    events = input<EventCalandar[]>();
    specialEvents = input<DateSpecialEvent[]>([]);

    /** 1 => January, 12 => december */
    mois = model.required<number>({ alias: "month" });
    annee = model.required<number>({ alias: "year" });
    weekendDisabled = input(false, { transform: booleanAttribute });
    mondayFirst = input(false, { transform: booleanAttribute });
    matRippleDisabled = input(false, { transform: booleanAttribute });

    /** 0 => Sunday, 6 => Monday */
    daysOfWeekDisabled = input<number[]>([]);

    /** 1 => January, 12 => december */
    monthsDisabled = input<number[]>([]);
    daysDisabled = input<Date[]>();

    /** Disabled interval date */
    intervalsDisabled = input<DateCalandarDisabled[]>([]);

    eventClickJour = output<DateCalendrier>({ alias: "dayClicked" });
    eventClickEvent = output<EventCalandar>({ alias: "eventClicked" });
    eventUpdated = output<EventCalandar>();
    eventCreated = output<DateInterval>();

    protected estPetitEcran = signal(false);
    protected overrideRipple = signal(false);
    protected texteEventPlus = signal<string>("one more");
    protected texteBtnAujourdhui = signal<string>("Today");
    protected hoveredEvent = signal<EventCalandar | null>(null);

    private readonly langueNavigateur = navigator.language || "fr-FR";
    
    private dernierTouchTime = 0;
    protected dragCreationEnCours = signal(false);
    protected dateDebutCreation = signal<Date | null>(null);
    protected dateFinCreation = signal<Date | null>(null);
    protected previewResize = signal<{ eventId: any, startDate: Date, endDate: Date } | null>(null);

    protected displayEvents = computed(() => 
    {
        const preview = this.previewResize();
        const baseEvents = this.events() ?? [];

        if (!preview)
            return baseEvents;

        // Si on est en train de redimensionner, on remplace temporairement les dates de l'événement concerné
        return baseEvents.map(ev => 
            ev.id == preview.eventId ? { ...ev, startDate: preview.startDate, endDate: preview.endDate } : ev
        );
    });

    protected nomMois = computed(() =>
    {
        const DATE = new Date(this.annee(), this.mois() - 1, 1);
        return new Intl.DateTimeFormat(this.langueNavigateur, { month: 'long' }).format(DATE);
    });

    protected nbColonnes = computed(() => 7 - this.joursAExclure().length);
    protected maxLignesVisibles = computed(() => this.estPetitEcran() ? 3 : 4); 

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

    protected listeSemaines = computed<SemaineCalendrier[]>(() => 
    {
        const joursPlats = this.listeDate(); 
        const nbCols = this.nbColonnes();
        const semaines: SemaineCalendrier[] = [];

        for (let i = 0; i < joursPlats.length; i += nbCols) 
        {
            const joursSemaine = joursPlats.slice(i, i + nbCols);
            let eventsPositionnes: EventPositionne[] = [];
            let slotsOccuppes: { [jour: number]: number[] } = {};

            // 1. Récupérer tous les événements uniques de cette semaine
            const setEvents = new Set<EventCalandar>();
            joursSemaine.forEach(j => 
            {
                j.listeEvent.forEach(ev => setEvents.add(ev));
            });

            // 2. Trier : on place en haut les plus anciens et les plus longs
            const eventsTries = Array.from(setEvents).sort((a, b) => 
            {
                const startDiff = a.startDate.getTime() - b.startDate.getTime();

                if (startDiff != 0) 
                    return startDiff;

                return (b.endDate.getTime() - b.startDate.getTime()) - (a.endDate.getTime() - a.startDate.getTime());
            });

            // 3. Calculer les slots
            eventsTries.forEach(ev => {
                // Trouver les index de début et fin DANS LA SEMAINE
                const startIdx = joursSemaine.findIndex(j => this.EstMemeJour(j.date, ev.startDate));
                const actualStartIdx = startIdx === -1 ? 0 : startIdx; 

                const endIdx = joursSemaine.findIndex(j => this.EstMemeJour(j.date, ev.endDate));
                const actualEndIdx = endIdx === -1 ? (nbCols - 1) : endIdx; 

                const duree = (actualEndIdx - actualStartIdx) + 1;

                // Trouver la première ligne libre
                let ligne = 0;
                let ligneLibre = false;
                while (!ligneLibre) {
                    ligneLibre = true;
                    for (let j = actualStartIdx; j <= actualEndIdx; j++) {
                        if (!slotsOccuppes[j]) slotsOccuppes[j] = [];
                        if (slotsOccuppes[j].includes(ligne)) {
                            ligneLibre = false;
                            ligne++;
                            break;
                        }
                    }
                }

                // Réserver les slots pour ces jours
                for (let j = actualStartIdx; j <= actualEndIdx; j++) {
                    if (!slotsOccuppes[j]) slotsOccuppes[j] = [];
                    slotsOccuppes[j].push(ligne);
                }

                eventsPositionnes.push({ event: ev, jourDebutIndex: actualStartIdx, dureeJours: duree, ligne: ligne });
            });

            semaines.push({ jours: joursSemaine, eventsPositionnes });
        }
        return semaines;
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
        const A_MASQUER = new Set(this.daysOfWeekDisabled());

        if (this.weekendDisabled())
        {
            A_MASQUER.add(0);
            A_MASQUER.add(6);
        }

        return Array.from(A_MASQUER);
    });

    ngOnInit(): void 
    {
        this.onResize();
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

        this.texteEventPlus.set(DICT_TRADUCTION[LANGUE] || DICT_TRADUCTION['en']);
        
        const DICT_TRADUCTION_BTN: Record<string, string> = 
        {
            'fr': "Aujourd'hui",
            'it': "Oggi",
            'de': "Heute",
            'es': "Hoy",
            'pt': "Hoje",
            'en': "Today"
        };

        this.texteBtnAujourdhui.set(DICT_TRADUCTION_BTN[LANGUE] || DICT_TRADUCTION_BTN['en']);
    }

    protected ScrollVersAnneeActive(): void 
    {
        // le temps que le mat menu existe reelement
        setTimeout(() => 
        {
            const boutonActif = document.querySelector('.year-grid .active-year');
            
            if (boutonActif) 
            {
                boutonActif.scrollIntoView({
                    behavior: "instant",
                    block: "center"
                });
            }
        }, 50);
    }

    protected EstMemeJour(date1: Date, date2: Date): boolean 
    {
        return date1.getDate() === date2.getDate() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getFullYear() === date2.getFullYear();
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

    protected ChangerAnnee(_annee: number): void
    {
        this.annee.set(_annee);
    }

    protected ScrollHorizontal(event: WheelEvent): void 
    {
        const conteneur = event.currentTarget as HTMLElement;

        // On vérifie il on peut scroller
        if (conteneur.scrollWidth > conteneur.clientWidth)
        {
            event.preventDefault();  
            conteneur.scrollLeft += event.deltaY; 
        }
    }

    protected ClickEvent(_event: EventCalandar): void
    {   
        this.eventClickEvent.emit(_event);
    }

    protected OnDragStarted(): void 
    {   
        this.hoveredEvent.set(null);
    }

    protected OnDragEnded(): void 
    {
        this.hoveredEvent.set(null);
        this.overrideRipple.set(false);
    }

    protected OnEventDropped(dropEvent: CdkDragDrop<DateCalendrier>): void 
    {
        if (dropEvent.previousContainer == dropEvent.container) 
            return;

        const eventObj = dropEvent.item.data as EventCalandar;
        const targetDay = dropEvent.container.data as DateCalendrier;

        // On remet les heures à zéro pour comparer uniquement les jours purs (évite les bugs liés à l'heure d'été/hiver)
        const DATE_DEBUT_SANS_HEURE = new Date(eventObj.startDate.getFullYear(), eventObj.startDate.getMonth(), eventObj.startDate.getDate()).getTime();
        const DATE_CIBLE_SANS_HEURE = new Date(targetDay.date.getFullYear(), targetDay.date.getMonth(), targetDay.date.getDate()).getTime();
        
        // La différence en millisecondes
        let differenceTemps = DATE_CIBLE_SANS_HEURE - DATE_DEBUT_SANS_HEURE;

        if(differenceTemps != 0)
        {
            const nouvelleDateDebut = new Date(eventObj.startDate.getTime() + differenceTemps);
            const nouvelleDateFin = new Date(eventObj.endDate.getTime() + differenceTemps);

            this.eventUpdated.emit({
                id: eventObj.id,
                titre: eventObj.titre,
                description: eventObj.description,
                startDate: nouvelleDateDebut,
                endDate: nouvelleDateFin
            });
        }
    }

    // Vérifie si un jour fait partie de la sélection en cours
    protected EstEnCreation(_date: Date): boolean 
    {
        const debut = this.dateDebutCreation();
        const fin = this.dateFinCreation();
        if (!this.dragCreationEnCours() || !debut || !fin) return false;

        const tDate = new Date(_date.getFullYear(), _date.getMonth(), _date.getDate()).getTime();
        const tDebut = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate()).getTime();
        const tFin = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate()).getTime();

        const min = Math.min(tDebut, tFin);
        const max = Math.max(tDebut, tFin);

        return tDate >= min && tDate <= max;
    }

    protected OnMouseDownCreation(event: MouseEvent | TouchEvent, dateJour: Date, estBloquer: boolean): void 
    {
        if (estBloquer) 
            return;

        // Anti-Ghost Click Mobile
        if (event.type == 'touchstart') 
            this.dernierTouchTime = Date.now();

        else if (event.type === 'mousedown' && Date.now() - this.dernierTouchTime < 500) 
            return;

        if (event instanceof MouseEvent && event.button != 0) 
            return;

        // ignorer si l'utilisateur essaie d'attraper un événement existant
        const target = event.target as HTMLElement;
        if (target.closest('.event-item') || target.closest('.special-event-indicators-container')) 
            return;

        const clientXDebut = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
        const clientYDebut = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

        this.dateDebutCreation.set(dateJour);
        this.dateFinCreation.set(dateJour);
        this.dragCreationEnCours.set(false);

        let aBouge = false;
        let intentionScroll = false;
        let modeDragCreation = false;
        let timeoutAppuiLong: any;

        if (event.type.startsWith('touch')) 
        {
            timeoutAppuiLong = setTimeout(() => {
                if (!aBouge) 
                {
                    modeDragCreation = true;
                    this.dragCreationEnCours.set(true);

                    if (navigator.vibrate) 
                        navigator.vibrate(50);
                }
            }, 350);
        } 
        else 
            modeDragCreation = true;

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (intentionScroll) 
                return;

            const moveX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            const moveY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

            if (Math.abs(moveX - clientXDebut) > 5 || Math.abs(moveY - clientYDebut) > 5)
                aBouge = true;

            if (!modeDragCreation) 
            {
                if (aBouge) 
                {
                    intentionScroll = true;
                    clearTimeout(timeoutAppuiLong);
                    return;
                }
            } 
            else 
            {
                if (aBouge) 
                    this.dragCreationEnCours.set(true);

                if (_moveEvent.cancelable) 
                    _moveEvent.preventDefault();

                let hoveredCell: HTMLElement | null = null;
                if (_moveEvent instanceof MouseEvent)
                    hoveredCell = (_moveEvent.target as HTMLElement).closest('.day-cell');

                else 
                {
                    const touch = _moveEvent.touches[0];
                    const elementFromPoint = document.elementFromPoint(touch.clientX, touch.clientY);
                    hoveredCell = elementFromPoint ? elementFromPoint.closest('.day-cell') : null;
                }

                if (hoveredCell && hoveredCell.dataset['date']) 
                {
                    let timestamp = parseInt(hoveredCell.dataset['date'], 10);

                    if (!isNaN(timestamp))
                        this.dateFinCreation.set(new Date(timestamp));
                }
            }
        };

        const onMouseUp = () => 
        {
            clearTimeout(timeoutAppuiLong);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            // CLIC SIMPLE
            if (!intentionScroll) 
            {
                if (!aBouge && !this.dragCreationEnCours()) 
                {
                    let dateCalendrier = this.listeDate().find(x => x.date.getTime() == dateJour.getTime());

                    if (dateCalendrier) 
                        this.eventClickJour.emit(dateCalendrier);
                } 
                // DRAG MULTI-JOURS
                else if (modeDragCreation && aBouge && this.dragCreationEnCours()) 
                {
                    let debut = this.dateDebutCreation();
                    let fin = this.dateFinCreation();

                    if (debut && fin) 
                    {   
                        this.eventCreated.emit({ 
                            start:  new Date(Math.min(debut.getTime(), fin.getTime())), 
                            end: new Date(Math.max(debut.getTime(), fin.getTime()))
                        });
                    }
                }
            }

            this.dragCreationEnCours.set(false);
            this.dateDebutCreation.set(null);
            this.dateFinCreation.set(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
    }

    protected OnResizeStart(_e: MouseEvent | TouchEvent, _eventObj: EventCalandar, _side: 'left' | 'right'): void 
    {
        _e.preventDefault();
        _e.stopPropagation();

        let dateTrouvee = false;
        let finalStartDate = new Date(_eventObj.startDate);
        let finalEndDate = new Date(_eventObj.endDate);

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (_moveEvent.cancelable) 
                _moveEvent.preventDefault(); 

            let clientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            let clientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

            const elementFromPoint = document.elementFromPoint(clientX, clientY);
            let hoveredCell = elementFromPoint ? elementFromPoint.closest('.day-cell') as HTMLElement : null;

            if (hoveredCell && hoveredCell.dataset['date']) 
            {
                let timestamp = parseInt(hoveredCell.dataset['date'], 10);
                if (!isNaN(timestamp)) 
                {
                    let hoveredDate = new Date(timestamp);
                    dateTrouvee = true;

                    if (_side == "left") 
                    {
                        if (hoveredDate.getTime() > _eventObj.endDate.getTime()) 
                            hoveredDate = new Date(_eventObj.endDate);

                        finalStartDate = hoveredDate;
                    } 
                    else 
                    {
                        if (hoveredDate.getTime() < _eventObj.startDate.getTime()) 
                            hoveredDate = new Date(_eventObj.startDate);

                        finalEndDate = hoveredDate;
                    }

                    // actualiser automatiquement le front la barre selon le cuseur
                    this.previewResize.set({
                        eventId: _eventObj.id,
                        startDate: finalStartDate,
                        endDate: finalEndDate
                    });
                }
            }
        };

        const onMouseUp = () => 
        {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);
            
            // supprime le fantôme
            this.previewResize.set(null);

            // On émet si les dates ont changé
            if (dateTrouvee && (finalStartDate.getTime() != _eventObj.startDate.getTime() || finalEndDate.getTime() != _eventObj.endDate.getTime())) 
            {
                this.eventUpdated.emit({
                    ..._eventObj,
                    startDate: finalStartDate,
                    endDate: finalEndDate
                });
            }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
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

            let listeDateInterval = this.displayEvents().filter(x => this.EstDansIntervalle(date, x.startDate, x.endDate));            
            
            const M = date.getMonth() + 1; // 1 => janvier
            const D = date.getDate();  
            const Y = date.getFullYear();
            
            // --- LOGIQUE DE BLOCAGE DES JOURS ---
            
            // 1. Vérification des dates précises
            let estBloquerDatePrecise = this.daysDisabled()?.some(x => this.DateSontEgaux(x, date)) ?? false;

            // 2. Vérification de tes intervalles (récurrents ou ponctuels)
            let estBloquerIntervalle = this.intervalsDisabled().some(inter => {
                const startM = inter.start.month;
                const startD = inter.start.day;
                const startY = inter.start.year;

                const endM = inter.end.month;
                const endD = inter.end.day;
                const endY = inter.end.year;

                // CAS 1 : C'est un événement ponctuel (les deux années sont fournies)
                if (startY != undefined && startY != null && endY !== undefined && endY != null) 
                {
                    const tDate = new Date(Y, M - 1, D).getTime();
                    const tStart = new Date(startY, startM - 1, startD).getTime();
                    const tEnd = new Date(endY, endM - 1, endD).getTime();
                    
                    return tDate >= tStart && tDate <= tEnd;
                }

                // CAS 2 : C'est une période récurrente (ex: été ou hiver)
                const isNormalInterval = (startM < endM) || (startM === endM && startD <= endD);
                let estDansLaPeriode = false;

                if (isNormalInterval)
                    estDansLaPeriode = (M > startM || (M === startM && D >= startD)) && (M < endM || (M === endM && D <= endD));

                else
                    estDansLaPeriode = (M > startM || (M === startM && D >= startD)) || (M < endM || (M === endM && D <= endD));

                if (estDansLaPeriode) 
                {
                    if (startY !== undefined && Y < startY) 
                        return false;

                    if (endY !== undefined && Y > endY) 
                        return false;

                    return true;
                }

                return false;
            });

            let estBloquer = estBloquerDatePrecise || estBloquerIntervalle;
            
            // --- GESTION DES ÉVÉNEMENTS SPÉCIAUX (BADGES) ---
            const eventsSpeciauxDuJour = this.specialEvents().filter(sp => 
            {
                const startM = sp.dateStart.month;
                const startD = sp.dateStart.day;
                const endM = sp.dateEnd.month;
                const endD = sp.dateEnd.day;

                // Gere les intervalles normaux et ceux à cheval sur l'année
                const isNormalInterval = (startM < endM) || (startM === endM && startD <= endD);

                if (isNormalInterval) 
                    return (M > startM || (M === startM && D >= startD)) && (M < endM || (M === endM && D <= endD));

                else 
                    return (M > startM || (M === startM && D >= startD)) || (M < endM || (M === endM && D <= endD));

            });

            liste.push({
                date,
                estBloquer: estBloquer,
                estAujourdhui: this.EstDateJour(date),
                estMoisCourant: date.getMonth() == _de.getMonth(),
                estWeekend: date.getDay() == 0 || date.getDay() == 6,
                listeEvent: listeDateInterval,
                listeEventSpecial: eventsSpeciauxDuJour
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

    private DateSontEgaux(_date1: Date, _date2: Date): boolean
    {
        const DATE1 = new Date(_date1.getFullYear(), _date1.getMonth(), _date1.getDate());
        const DATE2 = new Date(_date2.getFullYear(), _date2.getMonth(), _date2.getDate());

        return DATE1.getTime() == DATE2.getTime();
    }

    private EstDateJour(_date: Date): boolean
    {
        const DATE_JOUR = new Date();

        return _date.getDate() === DATE_JOUR.getDate() &&
            _date.getMonth() === DATE_JOUR.getMonth() &&
            _date.getFullYear() === DATE_JOUR.getFullYear();
    }

    @HostListener('window:resize')
    protected onResize(): void
    {
        this.estPetitEcran.set(window.innerWidth <= 768);
    }
}

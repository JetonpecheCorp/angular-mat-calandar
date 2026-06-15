import { booleanAttribute, ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, model, OnDestroy, OnInit, output, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventCalandar } from '../../models/EventCalandar';
import { DateCalendrier } from '../../models/DateCalandar';
import { DatePipe, NgStyle } from '@angular/common';
import {MatRippleModule} from '@angular/material/core';
import {MatMenu, MatMenuModule } from '@angular/material/menu';
import { DateSpecialEvent, ThemeConfigCalandar } from '../../public-api';
import { DateInterval } from '../../models/DateInterval';
import { DateCalandarDisabled } from '../../models/DateCalandarDisabled';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EventGroup } from '../../models/EventGroup';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { SidebarConfigCalandar } from '../../models/SidebarConfigCalandar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter, DateAdapter } from '@angular/material/core';

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
  imports: [MatDatepickerModule, MatExpansionModule, MatCheckboxModule, MatSidenavModule, MatProgressSpinnerModule, MatMenuModule, MatRippleModule, DatePipe, MatToolbarModule, MatButtonModule, MatIconModule, NgStyle],
  templateUrl: './mat-month-calandar.html',
  styleUrl: './mat-month-calandar.css',
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatMonthCalandar implements OnInit, OnDestroy
{
    events = input<EventCalandar[]>();
    specialEvents = input<DateSpecialEvent[]>([]);
    groups = input<EventGroup[]>([]);
    customMatMenu = input<MatMenu | null>(null);

    /** 1 => January, 12 => december */
    mois = model.required<number>({ alias: "month" });
    annee = model.required<number>({ alias: "year" });
    useAmPm = input(false, { transform: booleanAttribute });
    weekendDisabled = input(false, { transform: booleanAttribute });
    mondayFirst = input(false, { transform: booleanAttribute });
    matRippleDisabled = input(false, { transform: booleanAttribute });
    hideNavYearBtn = input(false, { transform: booleanAttribute });
    showBtnAdd = input(false, { transform: booleanAttribute });
    readonly = input(false, { transform: booleanAttribute });
    readonlyPast = input(false, { transform: booleanAttribute });
    loading = input(false, { transform: booleanAttribute });

    /** 0 => Sunday, 6 => Monday */
    daysOfWeekDisabled = input<number[]>([]);

    /** 1 => January, 12 => december */
    monthsDisabled = input<number[]>([]);
    daysDisabled = input<Date[]>();

    /** Translate language (default navigator or en) */
    langue = input<string>(typeof navigator !== 'undefined' ? navigator.language : 'en');

    /** Disabled interval date */
    intervalsDisabled = input<DateCalandarDisabled[]>([]);
    themeConfig = input<ThemeConfigCalandar>();
    sidebarConfig = input<SidebarConfigCalandar>();
    eventClickJour = output<DateCalendrier>({ alias: "dayClicked" });
    eventClickEvent = output<EventCalandar>({ alias: "eventClicked" });
    eventUpdated = output<EventCalandar>();
    eventCreated = output<DateInterval>();
    btnAddClicked = output();

    /** Event when one option in default context menu is clicked */
    contextClicked = output<{ action: string, event: EventCalandar }>();

    protected estPetitEcran = signal(false);
    protected overrideRipple = signal(false);
    protected hoveredEvent = signal<EventCalandar | null>(null);
    protected dateRetourFocus = signal<number | null>(null);

    protected panneauOuvert = signal(false);
    protected groupesMasques = signal<Set<string | number>>(new Set());
    
    private dernierTouchTime = 0;
    protected dragCreationEnCours = signal(false);
    protected dateDebutCreation = signal<Date | null>(null);
    protected dateFinCreation = signal<Date | null>(null);
    protected previewResize = signal<{ eventId: any, startDate: Date, endDate: Date } | null>(null);
    protected zoneNavigationActive = signal<'left' | 'right' | null>(null);
    protected bulleSurvolee = signal<'left' | 'right' | null>(null);
    protected darkModeActif = signal(false);

    private themeObserver: MutationObserver | null = null;
    private el = inject(ElementRef);
    private dateAdapter = inject(DateAdapter);
    private navigationInterval: any = null;
    private ignoreBlur = false;
    private focusTimeout: any = null;
    private readonly DICT_TRADUCTION: Record<string, any> = {
        'fr': { 
            aujourdhui: "Aujourd'hui", ajouter: "Ajouter", modifier: "Modifier", supprimer: "Supprimer",
            chargement: "Chargement en cours",
            ariaPrecedent: "Mois précédent", ariaSuivant: "Mois suivant",
            ariaAnneePrecedente: "Année précédente", ariaAnneeSuivante: "Année suivante",
            ariaMenuMois: "Changer le mois", ariaMenuAnnee: "Changer l'année",
            sansGroupe: "Autres événements", titreGroupes: "Thèmes", 
            aucunEvent: "Aucun événement prévu ce mois-ci.",
            ariaOuvrirMenu: "Ouvrir le menu des thèmes", ariaFermerMenu: "Fermer le menu des thèmes",
            ariaEvenement: "Événement :", ariaLectureSeule: "Lecture seule",
            ariaMasquerGroupe: "Masquer", ariaAfficherGroupe: "Afficher", ariaOuvrirEvent: "Ouvrir l'événement",
            ariaEventSpecial: "Événement spécial :",
            aideNavMois: ". Touches P et N pour changer de mois. Majuscule plus P et N pour changer d'année"
        },
        'en': {
            plus: "more", 
            aujourdhui: "Today", 
            ajouter: "Add new",
            modifier: "Edit",
            supprimer: "Delete",
            ariaPrecedent: "Previous", 
            ariaSuivant: "Next", 
            ariaAnneePrecedente: "Previous year", 
            ariaAnneeSuivante: "Next year", 
            ariaMenuMois: "Change month menu",
            ariaMenuAnnee: "Change year menu",
            ariaEvenement: "Event:", 
            ariaCreer: "Create event on",
            chargement: "Loading",
            aideCreerEtendre: " (Shift plus arrows to extend)",
            aideCreerValider: " (Enter to validate)",
            aideDescendre: ". Alt plus down arrow to select an event",
            aideEventModif: " (Editing in progress. Enter to validate, Escape to cancel)",
            aideEventNormal: " (Shift plus arrows to move. Ctrl plus arrows to resize end. Ctrl plus Shift plus arrows to resize start. Alt plus up arrow to return to day)",
            aideNavMois: ". P or N to change month. Add SHIFT to change year",
            titreGroupes: "Themes", 
            sansGroupe: "Other events",
            ariaMasquerGroupe: "Hide",
            ariaAfficherGroupe: "Show",
            ariaOuvrirEvent: "Open event",
            ariaOuvrirMenu: "Open themes menu",
            ariaFermerMenu: "Close themes menu",
            ariaBloque: "Unavailable",
            ariaLectureSeule: "Read-only"
        },
        'es': {
            aujourdhui: "Hoy", ajouter: "Añadir", modifier: "Editar", supprimer: "Eliminar",
            chargement: "Cargando",
            ariaPrecedent: "Mes anterior", ariaSuivant: "Mes siguiente",
            ariaAnneePrecedente: "Año anterior", ariaAnneeSuivante: "Año siguiente",
            ariaMenuMois: "Cambiar mes", ariaMenuAnnee: "Cambiar año",
            sansGroupe: "Otros eventos", titreGroupes: "Temas", 
            aucunEvent: "No hay eventos programados este mes.",
            ariaOuvrirMenu: "Abrir el menú de temas", ariaFermerMenu: "Cerrar le menú de temas",
            ariaEvenement: "Evento:", ariaLectureSeule: "Solo lectura",
            ariaMasquerGroupe: "Ocultar", ariaAfficherGroupe: "Mostrar", ariaOuvrirEvent: "Abrir evento",
            ariaEventSpecial: "Evento especial:",
            aideNavMois: ". Teclas P y N para cambiar de mes. Añade MAYÚS para cambiar de año"
        },
        'it': { 
            aujourdhui: "Oggi", ajouter: "Aggiungi", modifier: "Modifica", supprimer: "Elimina",
            chargement: "Caricamento",
            ariaPrecedent: "Mese precedente", ariaSuivant: "Mese successivo",
            ariaAnneePrecedente: "Anno precedente", ariaAnneeSuivante: "Anno successivo",
            ariaMenuMois: "Cambia mese", ariaMenuAnnee: "Cambia anno",
            sansGroupe: "Altri eventi", titreGroupes: "Temi", 
            aucunEvent: "Nessun evento in programma questo mese.",
            ariaOuvrirMenu: "Apri il menu dei temi", ariaFermerMenu: "Chiudi il menu dei temi",
            ariaEvenement: "Evento:", ariaLectureSeule: "Sola lettura",
            ariaMasquerGroupe: "Nascondi", ariaAfficherGroupe: "Mostra", ariaOuvrirEvent: "Apri evento",
            ariaEventSpecial: "Evento speciale:",
            aideNavMois: ". Tasti P e N per cambiare mese. Aggiungi MAIUSC per cambiare anno"
        },
        'de': { 
            aujourdhui: "Heute", ajouter: "Hinzufügen", modifier: "Bearbeiten", supprimer: "Löschen",
            chargement: "Wird geladen",
            ariaPrecedent: "Vorheriger Monat", ariaSuivant: "Nächster Monat",
            ariaAnneePrecedente: "Vorheriges Jahr", ariaAnneeSuivante: "Nächstes Jahr",
            ariaMenuMois: "Monat ändern", ariaMenuAnnee: "Jahr ändern",
            sansGroupe: "Andere Ereignisse", titreGroupes: "Themen", 
            aucunEvent: "Diesen Monat sind keine Ereignisse geplant.",
            ariaOuvrirMenu: "Themenmenü öffnen", ariaFermerMenu: "Themenmenü schließen",
            ariaEvenement: "Ereignis:", ariaLectureSeule: "Schreibgeschützt",
            ariaMasquerGroupe: "Ausblenden", ariaAfficherGroupe: "Anzeigen", ariaOuvrirEvent: "Ereignis öffnen",
            ariaEventSpecial: "Besonderes Ereignis:",
            aideNavMois: ". Tasten P und N, um den Monat zu ändern. Umschalt hinzufügen, um das Jahr zu ändern"
        },
        'pt': { 
            aujourdhui: "Hoje", ajouter: "Adicionar", modifier: "Editar", supprimer: "Excluir",
            chargement: "Carregando",
            ariaPrecedent: "Mês anterior", ariaSuivant: "Mês seguinte",
            ariaAnneePrecedente: "Ano anterior", ariaAnneeSuivante: "Ano seguinte",
            ariaMenuMois: "Mudar mês", ariaMenuAnnee: "Mudar ano",
            sansGroupe: "Outros eventos", titreGroupes: "Temas", 
            aucunEvent: "Nenhum evento programado para este mês.",
            ariaOuvrirMenu: "Abrir o menu de temas", ariaFermerMenu: "Fechar o menu de temas",
            ariaEvenement: "Evento:", ariaLectureSeule: "Somente leitura",
            ariaMasquerGroupe: "Ocultar", ariaAfficherGroupe: "Mostrar", ariaOuvrirEvent: "Abrir evento",
            ariaEventSpecial: "Evento especial:",
            aideNavMois: ". Teclas P e N para mudar de mês. Adicione SHIFT para mudar de ano"
        }
    };

    constructor() 
    {
        effect(() => this.dateAdapter.setLocale(this.langue()));
    }

    protected dateReference = computed(() => new Date(this.annee(), this.mois() - 1, 1));

    protected trad = computed(() => {
        const codeLangue = this.langue().substring(0, 2).toLowerCase();
        return this.DICT_TRADUCTION[codeLangue] || this.DICT_TRADUCTION['fr'];
    });

    protected listeEvenementGroupe = computed(() => 
    {
        const tousLesEvents = this.events() || [];
        const tousLesGroupes = this.groups() || [];
        const resultat: { group: any | null, events: EventCalandar[] }[] = [];

        // 1. Événements avec groupe
        tousLesGroupes.forEach(g => {
            const evs = tousLesEvents.filter(e => (e as any).groupEventId === g.id);
            if (evs.length > 0) {
                resultat.push({ group: g, events: evs });
            }
        });

        // 2. Événements sans groupe
        const sansGroupe = tousLesEvents.filter(e => !e.groupEventId);

        if (sansGroupe.length > 0)
            resultat.push({ group: null, events: sansGroupe });

        return resultat;
    });

    protected displayEvents = computed(() => 
    {
        const apercu = this.previewResize();
        const baseEvents = this.events() ?? [];
        const masques = this.groupesMasques();
        const bloquerPasse = this.readonlyPast();
        const minuitAujourdhui = new Date().setHours(0, 0, 0, 0);

        const eventsFiltres = baseEvents.filter(ev => {
            const idGroupe = ev.groupEventId || 'sans-groupe';
            return !masques.has(idGroupe);
        }).map(ev => 
        {
            if (bloquerPasse && ev.startDate.getTime() < minuitAujourdhui) 
                return { ...ev, readonly: true };

            return ev;
        });

        if (!apercu)
            return eventsFiltres;

        return eventsFiltres.map(ev => 
            ev.id == apercu.eventId ? { ...ev, startDate: apercu.startDate, endDate: apercu.endDate } : ev
        );
    });

    protected nomMois = computed(() =>
    {
        const DATE = new Date(this.annee(), this.mois() - 1, 1);
        return new Intl.DateTimeFormat(this.langue(), { month: 'long' }).format(DATE);
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
        
        const shortFormatter = new Intl.DateTimeFormat(this.langue(), { weekday: 'short' });
        const longFormatter = new Intl.DateTimeFormat(this.langue(), { weekday: 'long' });

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
        if(this.sidebarConfig()?.defaultOpen === true)
            this.panneauOuvert.set(true);

        this.onResize();

        this.VerifierTheme();

        // surveille la balise <html> et <body>
        this.themeObserver = new MutationObserver(() => {
            this.VerifierTheme();
        });

        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    ngOnDestroy(): void 
    {
        if (this.themeObserver)
            this.themeObserver.disconnect();
    }

    protected OnMonthSelected(date: Date, datepicker: any): void 
    {
        this.mois.set(date.getMonth() + 1);
        this.annee.set(date.getFullYear());
        datepicker.close();
    }

    protected GetEventStyle(eventObj: EventCalandar): any 
    {
        if (!eventObj.groupEventId) 
            return {};

        const group = this.groups().find(g => g.id === eventObj.groupEventId);
        if (!group) 
            return {};

        if (this.darkModeActif()) 
        {
            return {
                '--event-bg': group.bgColorDark || group.bgColorLight,
                '--event-text': group.textColorDark || group.textColorLight
            };
        } 
        else 
        {
            return {
                '--event-bg': group.bgColorLight,
                '--event-text': group.textColorLight
            };
        }
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

    protected AnneePrecedente(): void 
    {
        this.annee.set(this.annee() - 1);
    }

    protected AnneeSuivante(): void 
    {
        this.annee.set(this.annee() + 1);
    }

    protected AllerAujourdhui(): void 
    {
        let dateJour = new Date();
        this.mois.set(dateJour.getMonth() + 1);
        this.annee.set(dateJour.getFullYear());
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

    protected BtnAjouterClicker(): void
    {
        this.btnAddClicked.emit();
    }

    protected ClickEvent(_event: EventCalandar): void
    {   
        this.eventClickEvent.emit(_event);
    }

    protected OnContextMenuAction(_action: string, _event: EventCalandar): void 
    { 
        this.contextClicked.emit({
            action: _action,
            event: _event
        });
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

    protected OnMouseDownCreation(event: MouseEvent | TouchEvent | Event, dateJour: Date, estBloquer: boolean): void 
    {
        if (this.readonly() || estBloquer) 
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

        const clientXDebut = event instanceof MouseEvent ? event.clientX : (event as TouchEvent).touches[0].clientX;
        const clientYDebut = event instanceof MouseEvent ? event.clientY : (event as TouchEvent).touches[0].clientY;

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
                this.GererNavigationBulle(moveX, moveY);

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
                    {
                        if (this.readonlyPast() && timestamp < new Date().setHours(0, 0, 0, 0))
                            timestamp = new Date().setHours(0, 0, 0, 0);

                        this.dateFinCreation.set(new Date(timestamp));
                    }
                }
            }
        };

        const onMouseUp = () => 
        {
            clearTimeout(timeoutAppuiLong);
            this.NettoyerNavigationBulle();

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

    protected OnMoveStart(_e: MouseEvent | TouchEvent, _eventObj: EventCalandar): void 
    {
        if (this.readonly() || _eventObj.readonly) return;
        if (_e instanceof MouseEvent && _e.button !== 0) return;

        _e.preventDefault();
        _e.stopPropagation();

        let clientXDebut = _e instanceof MouseEvent ? _e.clientX : _e.touches[0].clientX;
        let clientYDebut = _e instanceof MouseEvent ? _e.clientY : _e.touches[0].clientY;

        this.hoveredEvent.set(null); 

        // 1. On récupère le vrai élément HTML que l'on vient de cliquer
        const targetElement = (_e.target as HTMLElement).closest('.absolute-event') as HTMLElement;
        if (!targetElement) return;

        // 2. On calcule où la souris a cliqué par rapport au coin de l'événement (pour une prise en main naturelle)
        const rect = targetElement.getBoundingClientRect();
        const offsetX = clientXDebut - rect.left;
        const offsetY = clientYDebut - rect.top;

        let elementsDebut = document.elementsFromPoint(clientXDebut, clientYDebut);
        let caseOrigine = elementsDebut.find(el => el.classList.contains('day-cell')) as HTMLElement | undefined;

        if (!caseOrigine || !caseOrigine.dataset['date']) return;

        let dateOrigine = new Date(parseInt(caseOrigine.dataset['date'], 10));
        dateOrigine.setHours(0, 0, 0, 0);

        let aBouge = false;
        let dateTrouvee = false;
        let finalStartDate = new Date(_eventObj.startDate);
        let finalEndDate = new Date(_eventObj.endDate);
        
        // 3. Variable pour stocker notre fantôme
        let elementFantome: HTMLElement | null = null;

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (_moveEvent.cancelable) _moveEvent.preventDefault();

            let clientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            let clientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

            if (!aBouge && (Math.abs(clientX - clientXDebut) > 5 || Math.abs(clientY - clientYDebut) > 5)) {
                aBouge = true;
                this.overrideRipple.set(true);

                // 🆕 CRÉATION DU FANTÔME au premier mouvement
                elementFantome = targetElement.cloneNode(true) as HTMLElement;
                elementFantome.classList.add('event-ghost-preview'); // Classe CSS dédiée
                elementFantome.style.width = rect.width + 'px';      // On fige sa taille
                elementFantome.style.height = rect.height + 'px';
                
                // On l'ajoute directement au body pour qu'il ne soit pas bloqué par les overflow
                document.body.appendChild(elementFantome);
            }

            if (aBouge) 
            {
                // 🆕 DÉPLACEMENT DU FANTÔME fluide avec la souris
                if (elementFantome) {
                    elementFantome.style.left = (clientX - offsetX) + 'px';
                    elementFantome.style.top = (clientY - offsetY) + 'px';
                }

                this.GererNavigationBulle(clientX, clientY);

                const elementsSurvoles = document.elementsFromPoint(clientX, clientY);
                let hoveredCell = elementsSurvoles.find(el => el.classList.contains('day-cell')) as HTMLElement | undefined;

                if (hoveredCell && hoveredCell.dataset['date']) 
                {
                    let timestampSurvole = parseInt(hoveredCell.dataset['date'], 10);
                    if (!isNaN(timestampSurvole)) 
                    {
                        let hoveredDate = new Date(timestampSurvole);
                        hoveredDate.setHours(0, 0, 0, 0);

                        const diffJours = Math.round((hoveredDate.getTime() - dateOrigine.getTime()) / (1000 * 60 * 60 * 24));

                        let nouvelleDateDebut = new Date(_eventObj.startDate);
                        nouvelleDateDebut.setDate(nouvelleDateDebut.getDate() + diffJours);

                        let nouvelleDateFin = new Date(_eventObj.endDate);
                        nouvelleDateFin.setDate(nouvelleDateFin.getDate() + diffJours);

                        if ((this.readonlyPast() && nouvelleDateDebut.getTime() < new Date().setHours(0, 0, 0, 0)) || hoveredCell.classList.contains('day-disabled')) 
                            return;

                        finalStartDate = nouvelleDateDebut;
                        finalEndDate = nouvelleDateFin;
                        dateTrouvee = true;

                        this.previewResize.set({
                            eventId: _eventObj.id,
                            startDate: finalStartDate,
                            endDate: finalEndDate
                        });
                    }
                }
            }
        };

        const onMouseUp = () => 
        {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            // 🆕 DESTRUCTION DU FANTÔME
            if (elementFantome) {
                elementFantome.remove();
                elementFantome = null;
            }

            this.overrideRipple.set(false);
            this.previewResize.set(null);
            this.NettoyerNavigationBulle();

            if (aBouge && dateTrouvee && (finalStartDate.getTime() != _eventObj.startDate.getTime() || finalEndDate.getTime() != _eventObj.endDate.getTime())) 
            {
                this.eventUpdated.emit({
                    id: _eventObj.id,
                    titre: _eventObj.titre,
                    groupEventId: _eventObj.groupEventId,
                    description: _eventObj.description,
                    readonly: _eventObj.readonly,
                    startDate: finalStartDate,
                    endDate: finalEndDate
                });
            }
            else if (!aBouge) 
            {
                this.ClickEvent(_eventObj);
            }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
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

            this.GererNavigationBulle(clientX, clientY);

            const elementsSurvoles = document.elementsFromPoint(clientX, clientY);
            let hoveredCell = elementsSurvoles.find(el => el.classList.contains('day-cell')) as HTMLElement | undefined;

            if (hoveredCell && hoveredCell.dataset['date']) 
            {
                let timestamp = parseInt(hoveredCell.dataset['date'], 10);
                if (!isNaN(timestamp)) 
                {
                    let hoveredDate = new Date(timestamp);
                    dateTrouvee = true;

                    if (this.readonlyPast() && hoveredDate.getTime() < new Date().setHours(0, 0, 0, 0))
                        hoveredDate = new Date(new Date().setHours(0, 0, 0, 0));

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
            this.NettoyerNavigationBulle();

            // On émet si les dates ont changé
            if (dateTrouvee && (finalStartDate.getTime() != _eventObj.startDate.getTime() || finalEndDate.getTime() != _eventObj.endDate.getTime())) 
            {
                this.eventUpdated.emit({
                    id: _eventObj.id,
                    titre: _eventObj.titre,
                    groupEventId: _eventObj.groupEventId,
                    description: _eventObj.description,
                    readonly: _eventObj.readonly,
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

    protected OnDayCellKeydown(event: KeyboardEvent, dateJour: Date, estBloquer: boolean, eventsDuJour: EventCalandar[] = []): void 
    {
        if (event.key == 'Escape') 
        {
            if (this.dragCreationEnCours()) 
            {
                this.AnnulerCreationClavier();
                event.preventDefault();
            }

            return;
        }

        if (event.key === 'Tab') 
        {
            const toutesLesCases = Array.from(this.el.nativeElement.querySelectorAll('.day-cell')) as HTMLElement[];
            const indexActuel = toutesLesCases.indexOf(event.target as HTMLElement);

            if (indexActuel !== -1) 
            {
                if (!event.shiftKey && indexActuel < toutesLesCases.length - 1) 
                {
                    event.preventDefault();
                    toutesLesCases[indexActuel + 1].focus();
                    return;
                }
                else if (event.shiftKey && indexActuel > 0) 
                {
                    event.preventDefault();
                    toutesLesCases[indexActuel - 1].focus();
                    return;
                }
            }
        }

        // Navigation fluide avec les flèches du clavier
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) 
        {
            event.preventDefault(); // Empêche la page de scroller
            
            const toutesLesCases = Array.from(this.el.nativeElement.querySelectorAll('.day-cell')) as HTMLElement[];
            const indexActuel = toutesLesCases.indexOf(event.target as HTMLElement);

            if (indexActuel !== -1) 
            {
                let indexCible = indexActuel;
                const nbCols = this.nbColonnes();

                if (event.key === 'ArrowRight') indexCible++;
                else if (event.key === 'ArrowLeft') indexCible--;
                else if (event.key === 'ArrowDown') indexCible += nbCols; // Descend d'une ligne
                else if (event.key === 'ArrowUp') indexCible -= nbCols;   // Monte d'une ligne

                if (indexCible >= 0 && indexCible < toutesLesCases.length) 
                {
                    toutesLesCases[indexCible].focus();
                }
            }
            return;
        }

        // Navigation Rapide
        if (['p', 'n'].includes(event.key.toLowerCase()) && !event.ctrlKey && !event.metaKey && !event.altKey) 
        {
            event.preventDefault();

            let nouvelleDate = new Date(dateJour);
            const recule = event.key.toLowerCase() === 'p';

            if (event.shiftKey)
                nouvelleDate.setFullYear(nouvelleDate.getFullYear() + (recule ? -1 : 1));
            else 
            {
                const moisCible = nouvelleDate.getMonth() + (recule ? -1 : 1);
                nouvelleDate.setMonth(moisCible);
                
                if (nouvelleDate.getMonth() !== ((moisCible % 12 + 12) % 12))
                    nouvelleDate.setDate(0); 
            }

            this.mois.set(nouvelleDate.getMonth() + 1);
            this.annee.set(nouvelleDate.getFullYear());

            setTimeout(() => {
                let caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${nouvelleDate.getTime()}"]`) as HTMLElement;
                
                if (caseJour)
                    caseJour.focus();
                else 
                {
                    const fallbackCell = this.el.nativeElement.querySelector('.day-cell:not(.out-of-month)') as HTMLElement;
                    if (fallbackCell) 
                        fallbackCell.focus();
                }
            }, 120);

            return;
        }

        if (event.key == 'Enter' || event.key == ' ') 
        {
            event.preventDefault();

            if (this.readonly()) 
                return;

            if (this.dragCreationEnCours()) 
            {
                const debut = this.dateDebutCreation();
                const fin = this.dateFinCreation();
                
                if (debut && fin) 
                {   
                    this.eventCreated.emit({ 
                        start: new Date(Math.min(debut.getTime(), fin.getTime())), 
                        end: new Date(Math.max(debut.getTime(), fin.getTime()))
                    });
                }
                this.AnnulerCreationClavier();
            } 
            else 
            {
                if (estBloquer) 
                    return; 

                let dateCalendrier = this.listeDate().find(x => x.date.getTime() == dateJour.getTime());

                if (dateCalendrier) 
                    this.eventClickJour.emit(dateCalendrier);
            }

            return;
        }

        // creation
        if (event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) 
        {
            event.preventDefault();
            if (this.readonly()) 
                return;

            if (estBloquer && !this.dragCreationEnCours()) 
                return;

            if (!this.dragCreationEnCours()) 
            {
                this.dragCreationEnCours.set(true);
                this.dateDebutCreation.set(dateJour);
                this.dateFinCreation.set(dateJour);
            }

            let decalage = 0;
            if (event.key == 'ArrowRight') 
                decalage = 1;

            else if (event.key == 'ArrowLeft') 
                decalage = -1;

            else if (event.key == 'ArrowDown') 
                decalage = 7;

            else if (event.key == 'ArrowUp') 
                decalage = -7;

            const dateActuelle = this.dateFinCreation() || dateJour;
            const nouvelleDateFin = new Date(dateActuelle);
            nouvelleDateFin.setDate(nouvelleDateFin.getDate() + decalage);

            // bloquer la creation vers le passé si readonlyPast
            if (this.readonlyPast() && nouvelleDateFin.getTime() < new Date().setHours(0, 0, 0, 0))
                nouvelleDateFin.setTime(new Date().setHours(0, 0, 0, 0));

            this.dateFinCreation.set(nouvelleDateFin);

            const nouveauMois = nouvelleDateFin.getMonth() + 1;
            const nouvelleAnnee = nouvelleDateFin.getFullYear();

            const moisAChange = (nouveauMois != this.mois() || nouvelleAnnee != this.annee());

            if (moisAChange) 
            {
                this.mois.set(nouveauMois);
                this.annee.set(nouvelleAnnee);
            }

            setTimeout(() => 
            {
                const targetCell = this.el.nativeElement.querySelector(`.day-cell[data-date="${nouvelleDateFin.getTime()}"]`) as HTMLElement;

                if (targetCell)
                    targetCell.focus();
                
            }, moisAChange ? 120 : 30);
        }

        // focus event
        if (event.altKey && event.key == 'ArrowDown') 
        {
            event.preventDefault();
            if (eventsDuJour && eventsDuJour.length > 0) 
            {
                this.dateRetourFocus.set(dateJour.getTime());

                const eventsTries = [...eventsDuJour].sort((a, b) => 
                {
                    const startDiff = a.startDate.getTime() - b.startDate.getTime();
                    if (startDiff !== 0) 
                        return startDiff;

                    return (b.endDate.getTime() - b.startDate.getTime()) - (a.endDate.getTime() - a.startDate.getTime());
                });

                const targetCell = event.target as HTMLElement;
                const weekRow = targetCell.closest('.week-row');

                if (weekRow)
                {
                    const eventElement = weekRow.querySelector(`#event-${eventsTries[0].id}`) as HTMLElement;
                    if (eventElement)
                        eventElement.focus();
                }
            }

            return;
        }
    }

    protected OnEventBlur(eventObj: EventCalandar): void 
    {
        if (this.ignoreBlur) 
            return; 

        const preview = this.previewResize();
        if (preview && preview.eventId === eventObj.id) 
        {
            this.previewResize.set(null);
        }
    }

    protected OnEventKeydown(_event: KeyboardEvent, _eventObj: EventCalandar): void 
    {
        if (_event.key == 'Escape') 
        {
            if (this.previewResize()) 
            {
                this.previewResize.set(null);
                _event.preventDefault();
                _event.stopPropagation();
            }
            return;
        }

        // Navigation Rapide
        if (['p', 'n'].includes(_event.key.toLowerCase()) && !_event.ctrlKey && !_event.metaKey && !_event.altKey)
        {
            _event.preventDefault();
            _event.stopPropagation();

            let nouvelleDate = new Date(_eventObj.startDate);
            const recule = _event.key.toLowerCase() === 'p';

            if (_event.shiftKey)
                nouvelleDate.setFullYear(nouvelleDate.getFullYear() + (recule ? -1 : 1));
            else
            {
                const moisCible = nouvelleDate.getMonth() + (recule ? -1 : 1);
                nouvelleDate.setMonth(moisCible);

                if (nouvelleDate.getMonth() !== ((moisCible % 12 + 12) % 12))
                    nouvelleDate.setDate(0);
            }

            this.mois.set(nouvelleDate.getMonth() + 1);
            this.annee.set(nouvelleDate.getFullYear());

            setTimeout(() => {
                const eventElement = this.el.nativeElement.querySelector(`#event-${_eventObj.id}`) as HTMLElement;
                
                if (eventElement)
                    eventElement.focus();
                else 
                {
                    let caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${nouvelleDate.getTime()}"]`) as HTMLElement;
                    if (!caseJour)
                        caseJour = this.el.nativeElement.querySelector('.day-cell:not(.out-of-month)') as HTMLElement;

                    if (caseJour) 
                        caseJour.focus();
                }
            }, 120);

            return;
        }

        if (_event.key == 'Enter' || _event.key == ' ') 
        {
            _event.preventDefault();
            _event.stopPropagation();

            const apercu = this.previewResize();
            if (apercu && apercu.eventId === _eventObj.id) 
            {
                this.eventUpdated.emit({
                    id: _eventObj.id,
                    titre: _eventObj.titre,
                    groupEventId: _eventObj.groupEventId,
                    description: _eventObj.description,
                    readonly: _eventObj.readonly,
                    startDate: apercu.startDate,
                    endDate: apercu.endDate
                });

                this.previewResize.set(null);
            }
            else 
                this.ClickEvent(_eventObj);

            return;
        }

        // 3. Remonter sur la case d'origine (Alt + Flèche Haut)
        if (_event.altKey && _event.key === 'ArrowUp') 
        {
            _event.preventDefault();
            
            // On utilise notre marque-page, ou par défaut le début de l'événement
            const timestamp = this.dateRetourFocus() || new Date(_eventObj.startDate.getFullYear(), _eventObj.startDate.getMonth(), _eventObj.startDate.getDate()).getTime();
            const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
            
            if (caseJour) 
                caseJour.focus();

            return;
        }

        if (_event.key == 'Tab')
        {
            const cible = _event.target as HTMLElement;
            const coucheEvenements = cible.closest('.events-foreground-layer');
            
            if (coucheEvenements) 
            {
                const tousLesEvenements = Array.from(coucheEvenements.querySelectorAll('.absolute-event')) as HTMLElement[];
                const indexActuel = tousLesEvenements.indexOf(cible);
                
                // A. Si on est sur le dernier événement de la semaine
                if (!_event.shiftKey && indexActuel == tousLesEvenements.length - 1) 
                {
                    _event.preventDefault(); 
                    
                    // Retour automatique au jour d'origine !
                    const timestamp = this.dateRetourFocus() || new Date(
                        _eventObj.startDate.getFullYear(), 
                        _eventObj.startDate.getMonth(),
                        _eventObj.startDate.getDate()
                    ).getTime();

                    const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
                    if (caseJour) 
                        caseJour.focus();
                }

                // B. Si on est sur le premier événement et on recule
                else if (_event.shiftKey && indexActuel == 0) 
                {
                    _event.preventDefault();
                    
                    // Retour automatique au jour d'origine !
                    const timestamp = this.dateRetourFocus() || new Date(_eventObj.startDate.getFullYear(), _eventObj.startDate.getMonth(), _eventObj.startDate.getDate()).getTime();
                    const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;

                    if (caseJour) 
                        caseJour.focus();
                }
            }

            return;
        }

// 5. Déplacement et Redimensionnement
        let estEnDeplacement = _event.shiftKey && !_event.ctrlKey && !_event.metaKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(_event.key);
        let estRedimensionnementFin = (_event.ctrlKey || _event.metaKey) && !_event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(_event.key);
        let estRedimensionnementDebut = (_event.ctrlKey || _event.metaKey) && _event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(_event.key);

        if (estEnDeplacement || estRedimensionnementFin || estRedimensionnementDebut) 
        {
            _event.preventDefault();
            _event.stopPropagation();

            if (this.readonly() || _eventObj.readonly) return;

            // 🆕 ON BLOQUE LE BLUR AVANT TOUT CHANGEMENT DE DOM
            this.ignoreBlur = true;
            if (this.focusTimeout) clearTimeout(this.focusTimeout);

            const apercuActuel = this.previewResize();
            const debutDeBase = (apercuActuel && apercuActuel.eventId == _eventObj.id) ? apercuActuel.startDate : _eventObj.startDate;
            const finDeBase = (apercuActuel && apercuActuel.eventId == _eventObj.id) ? apercuActuel.endDate : _eventObj.endDate;

            let nouveauDebut = new Date(debutDeBase);
            let nouvelleFin = new Date(finDeBase);

            let decalage = 0;
            if (_event.key == 'ArrowRight') decalage = 1;
            else if (_event.key == 'ArrowLeft') decalage = -1;
            else if (_event.key == 'ArrowDown') decalage = 7;
            else if (_event.key == 'ArrowUp') decalage = -7;

            if (estEnDeplacement) 
            {
                nouveauDebut.setDate(nouveauDebut.getDate() + decalage);
                nouvelleFin.setDate(nouvelleFin.getDate() + decalage);
            } 
            else if (estRedimensionnementFin) 
            {
                let testFin = new Date(nouvelleFin);
                testFin.setDate(testFin.getDate() + decalage);

                if (testFin.getTime() >= nouveauDebut.getTime())
                    nouvelleFin = testFin;
            }
            else if (estRedimensionnementDebut) 
            {
                let testDebut = new Date(nouveauDebut);
                testDebut.setDate(testDebut.getDate() + decalage);

                if (testDebut.getTime() <= nouvelleFin.getTime())
                    nouveauDebut = testDebut;
            }

            this.previewResize.set({
                eventId: _eventObj.id,
                startDate: nouveauDebut,
                endDate: nouvelleFin
            });

            const dateCible = estRedimensionnementDebut ? nouveauDebut : nouvelleFin;
            const nouveauMois = dateCible.getMonth() + 1;
            const nouvelleAnnee = dateCible.getFullYear();
            const moisAChange = (nouveauMois !== this.mois() || nouvelleAnnee !== this.annee());

            if (moisAChange) 
            {
                this.mois.set(nouveauMois);
                this.annee.set(nouvelleAnnee);
            }

            // 🆕 On réassigne le focus proprement
            this.focusTimeout = setTimeout(() => 
            {
                // Un événement sur plusieurs semaines génère plusieurs segments HTML.
                // querySelectorAll permet de tous les lister.
                const elementsEvenement = this.el.nativeElement.querySelectorAll(`#event-${_eventObj.id}`);
                
                if (elementsEvenement.length > 0)
                {
                    // Si on tire vers le bas, on suit le dernier segment. Sinon on suit le premier.
                    if (estRedimensionnementFin || (estEnDeplacement && decalage > 0))
                        (elementsEvenement[elementsEvenement.length - 1] as HTMLElement).focus();
                    else
                        (elementsEvenement[0] as HTMLElement).focus();
                }

                // 🆕 On réautorise le Blur
                this.ignoreBlur = false; 

            }, moisAChange ? 120 : 30);
        }
    }

    protected FormatDateAria(date: Date): string 
    {
        if (!date) 
            return '';
        
        // Utilise la langue détectée de ton composant (ou 'fr-FR' par défaut)
        const langue = this.langue() || 'fr-FR'; 

        // Renvoie par exemple "jeudi 15 mai 2026"
        return date.toLocaleDateString(langue, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    protected FormaterDateCourte(_date: Date): string 
    { 
        if (!_date) 
            return '';

        return new Intl.DateTimeFormat(this.langue(), { day: '2-digit', month: 'short' }).format(_date);
    }

    protected BasculerVisibiliteGroupe(idGroupe: string | number | null): void 
    {
        const actuel = new Set(this.groupesMasques());
        const idABasculer = idGroupe === null ? 'sans-groupe' : idGroupe;
        
        // afficher
        if (actuel.has(idABasculer))
            actuel.delete(idABasculer);

        else
            actuel.add(idABasculer);

        this.groupesMasques.set(actuel);
    }

    protected EstGroupeMasque(idGroupe: string | number | null): boolean 
    {
        const idAVerifier = idGroupe === null ? 'sans-groupe' : idGroupe;
        return this.groupesMasques().has(idAVerifier);
    }

    private VerifierTheme(): void 
    {
        const config = this.themeConfig();
        const classDark = config?.darkModeClass || '';
        const classLight = config?.lightModeClass || '';
        const themeDefaut = config?.defaultTheme || 'light';
        
        const aClasseSombre = classDark ? 
            (document.body.classList.contains(classDark) || document.documentElement.classList.contains(classDark)) : false;

        const aClasseClaire = classLight ? 
            (document.body.classList.contains(classLight) || document.documentElement.classList.contains(classLight)) : false;

        if (aClasseSombre)
            this.darkModeActif.set(true);

        else if (aClasseClaire)
            this.darkModeActif.set(false);

        else
            this.darkModeActif.set(themeDefaut == 'dark');
    }

    private AnnulerCreationClavier(): void 
    {
        this.dragCreationEnCours.set(false);
        this.dateDebutCreation.set(null);
        this.dateFinCreation.set(null);
    }

    private DeclencherNavigation(direction: 'left' | 'right'): void 
    {
        if (direction == 'left') 
            this.Precedent();
        else 
            this.Suivant();
    }

    private NettoyerNavigationBulle(): void 
    {
        this.zoneNavigationActive.set(null);
        this.bulleSurvolee.set(null);

        if (this.navigationInterval) 
        {
            clearInterval(this.navigationInterval);
            this.navigationInterval = null;
        }
    }

    private GererNavigationBulle(clientX: number, clientY: number): void 
    {
        const wrapper = this.el.nativeElement.querySelector('.calendar-wrapper') as HTMLElement;
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const MARGE = Math.max(60, rect.width * 0.1); 
        
        let zoneActive: 'left' | 'right' | null = null;
        if (clientY >= rect.top && clientY <= rect.bottom) 
        {
            if (clientX >= rect.left && clientX <= rect.left + MARGE) zoneActive = 'left';
            else if (clientX <= rect.right && clientX >= rect.right - MARGE) zoneActive = 'right';
        }
        
        this.zoneNavigationActive.set(zoneActive);

        let surLaBulle: 'left' | 'right' | null = null;
        if (zoneActive) 
        {
            const bulleEl = this.el.nativeElement.querySelector(`.nav-edge-indicator.${zoneActive} .nav-bubble`);
            if (bulleEl) 
            {
                const bRect = bulleEl.getBoundingClientRect();
                const padding = 15;
                if (clientX >= bRect.left - padding && clientX <= bRect.right + padding &&
                    clientY >= bRect.top - padding && clientY <= bRect.bottom + padding) 
                {
                    surLaBulle = zoneActive;
                }
            }
        }

        if (surLaBulle !== this.bulleSurvolee()) 
        {
            if (this.navigationInterval) 
            {
                clearInterval(this.navigationInterval);
                this.navigationInterval = null;
            }

            if (surLaBulle) 
            {
                this.navigationInterval = setInterval(() => {
                    if (!this.dragCreationEnCours() && !this.previewResize()) {
                        this.NettoyerNavigationBulle();
                        return;
                    }
                    this.DeclencherNavigation(surLaBulle!); // Fait changer le mois !
                }, 800);
            }
            
            this.bulleSurvolee.set(surLaBulle);
        }
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
            let estBloquerDatePrecise = this.daysDisabled()?.some(x => this.EstMemeJour(x, date)) ?? false;

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

            if (this.readonlyPast() && date.getTime() < new Date().setHours(0, 0, 0, 0))
                estBloquer = true;
            
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

    private EstDateJour(_date: Date): boolean
    {
        return this.EstMemeJour(_date, new Date());
    }

    @HostListener('window:resize')
    protected onResize(): void
    {
        this.estPetitEcran.set(window.innerWidth <= 768);
    }
}

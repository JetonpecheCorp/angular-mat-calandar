import { booleanAttribute, ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, model, OnDestroy, OnInit, output, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DateCalendrier } from '../../models/DateCalandar';
import { EventCalandar } from '../../models/EventCalandar';
import { EventGroup } from '../../models/EventGroup';
import { DateSpecialEvent } from '../../models/DateSpecialEvent';
import { DateCalandarDisabled } from '../../models/DateCalandarDisabled';
import { ThemeConfigCalandar } from '../../models/ThemeConfigCalandar';
import { SidebarConfigCalandar } from '../../models/SidebarConfigCalandar';
import { DateInterval } from '../../models/DateInterval';
import { DatePipe, NgStyle } from '@angular/common';
import { MatRippleModule } from '@angular/material/core';
import { MatMenu, MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter, DateAdapter } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

interface EventPositionne {
    event: EventCalandar;
    jourDebutIndex: number;
    dureeJours: number;
    ligne: number;
}

interface SemaineCalendrier {
    jours: InternalDateCalendrier[];
    eventsPositionnes: EventPositionne[];
}

interface InternalDateCalendrier extends DateCalendrier {
    nbEventsMasques: number;
}

@Component({
  selector: 'jp-mat-year-calandar',
  standalone: true,
  imports: [MatFormFieldModule, MatSelectModule, DatePipe, MatDatepickerModule, MatExpansionModule, MatCheckboxModule, MatSidenavModule, MatProgressSpinnerModule, MatMenuModule, MatRippleModule, MatToolbarModule, MatButtonModule, MatIconModule, NgStyle],
  templateUrl: './mat-year-calandar.html',
  styleUrl: './mat-year-calandar.css',
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatYearCalandar implements OnInit, OnDestroy 
{
    events = input<EventCalandar[]>([]);
    specialEvents = input<DateSpecialEvent[]>([]);
    groups = input<EventGroup[]>([]);
    customMatMenu = input<MatMenu | null>(null);

    annee = model.required<number>({ alias: "year" });
    
    useAmPm = input(false, { transform: booleanAttribute });
    weekendDisabled = input(false, { transform: booleanAttribute });
    mondayFirst = input(false, { transform: booleanAttribute });
    matRippleDisabled = input(false, { transform: booleanAttribute });
    showBtnAdd = input(false, { transform: booleanAttribute });
    readonly = input(false, { transform: booleanAttribute });
    readonlyPast = input(false, { transform: booleanAttribute });
    loading = input(false, { transform: booleanAttribute });
    hideSelectMonth = input(false, { transform: booleanAttribute });

    daysOfWeekDisabled = input<number[]>([]);
    monthsDisabled = input<number[]>([]);
    defaultHiddenMonths = input<number[]>([]);
    daysDisabled = input<Date[]>();
    intervalsDisabled = input<DateCalandarDisabled[]>([]);

    langue = input<string>(typeof navigator !== 'undefined' ? navigator.language : 'en');
    themeConfig = input<ThemeConfigCalandar>();
    sidebarConfig = input<SidebarConfigCalandar>();

    eventClickJour = output<DateCalendrier>({ alias: "dayClicked" });
    eventClickEvent = output<EventCalandar>({ alias: "eventClicked" });
    eventUpdated = output<EventCalandar>();
    eventCreated = output<DateInterval>();
    btnAddClicked = output();
    contextClicked = output<{ action: string, event: EventCalandar }>();

    protected estPetitEcran = signal(false);
    protected panneauOuvert = signal(false);
    protected groupesMasques = signal<Set<string | number>>(new Set());
    protected darkModeActif = signal(false);

    protected dragCreationEnCours = signal(false);
    protected dateDebutCreation = signal<Date | null>(null);
    protected dateFinCreation = signal<Date | null>(null);
    protected previewResize = signal<{ eventId: any, startDate: Date, endDate: Date } | null>(null);
    private dernierTouchTime = 0;
    protected dateRetourFocus = signal<number | null>(null);
    protected listeEventIdsFocus = signal<any[]>([]);
    protected messageAriaLive = signal<string>("");
    protected moisMasques = signal<number[]>([]);
    protected moisMasquesSet = computed(() => new Set(this.moisMasques()));
    
    private ignoreBlur = false;
    private focusTimeout: any = null;
    private themeObserver: MutationObserver | null = null;
    private dateAdapter = inject(DateAdapter);
    private el = inject(ElementRef);

    private readonly DICT_TRADUCTION: Record<string, any> = {
        'fr': { 
            aujourdhui: "Cette année", ajouter: "Ajouter", ceJour: "Aujourd'hui",
            modifier: "Modifier", supprimer: "Supprimer", ariaMoisDe: "Mois de",
            ariaAnneePrecedente: "Année précédente", ariaAnneeSuivante: "Année suivante",
            ariaMenuAnnee: "Changer l'année", chargement: "Chargement en cours",
            titreGroupes: "Thèmes", sansGroupe: "Autres", ariaEvenement: "événement(s)",
            ariaOuvrirMenu: "Ouvrir le menu", ariaFermerMenu: "Fermer le menu",
            ariaMasquerGroupe: "Masquer", ariaAfficherGroupe: "Afficher", ariaOuvrirEvent: "Ouvrir",
            ariaBloque: "Non disponible",
            ariaSelectionEtendue: "Sélection étendue jusqu'au ", ariaEventDeplace: "Événement déplacé du ",
            ariaEventRedimensionne: "Événement redimensionné du ", ariaAu: " au ",
            choisirMois: "Mois à masquer", ariaMasquerMois: "Sélectionner les mois à masquer",
            ariaMoisLectureSeul: "Mois en lecture seule",
            ariaEventMasques: "événements supplémentaires non affichés"
        },
        'en': {
            aujourdhui: "This year", ajouter: "Add new", ceJour: "Today",
            modifier: "Edit", supprimer: "Delete", ariaMoisDe: "Month of",
            ariaAnneePrecedente: "Previous year", ariaAnneeSuivante: "Next year",
            ariaMenuAnnee: "Change year", chargement: "Loading",
            titreGroupes: "Themes", sansGroupe: "Other", ariaEvenement: "event(s)",
            ariaOuvrirMenu: "Open menu", ariaFermerMenu: "Close menu",
            ariaMasquerGroupe: "Hide", ariaAfficherGroupe: "Show", ariaOuvrirEvent: "Open",
            ariaBloque: "Unavailable",
            ariaSelectionEtendue: "Selection extended to ", ariaEventDeplace: "Event moved from ",
            ariaEventRedimensionne: "Event resized from ", ariaAu: " to ",
            choisirMois: "Months to hide", ariaMasquerMois: "Select months to hide",
            ariaMoisLectureSeul: "Read-only month",
            ariaEventMasques: "additional hidden events"
        },
        'es': { 
            aujourdhui: "Este año", ajouter: "Añadir", ceJour: "Hoy",
            modifier: "Editar", supprimer: "Eliminar", ariaMoisDe: "Mes de",
            ariaAnneePrecedente: "Año anterior", ariaAnneeSuivante: "Año siguiente",
            ariaMenuAnnee: "Cambiar año", chargement: "Cargando",
            titreGroupes: "Temas", sansGroupe: "Otros", ariaEvenement: "evento(s)",
            ariaOuvrirMenu: "Abrir menú", ariaFermerMenu: "Cerrar menú",
            ariaMasquerGroupe: "Ocultar", ariaAfficherGroupe: "Mostrar", ariaOuvrirEvent: "Abrir",
            ariaBloque: "No disponible",
            ariaSelectionEtendue: "Selección extendida hasta el ", ariaEventDeplace: "Evento movido del ",
            ariaEventRedimensionne: "Evento redimensionado del ", ariaAu: " al ",
            choisirMois: "Meses a ocultar", ariaMasquerMois: "Seleccionar meses para ocultar",
            ariaMoisLectureSeul: "Mes de solo lectura",
            ariaEventMasques: "eventos adicionales ocultos"
        },
        'it': { 
            aujourdhui: "Quest'anno", ajouter: "Aggiungi", ceJour: "Oggi",
            modifier: "Modifica", supprimer: "Elimina", ariaMoisDe: "Mese di",
            ariaAnneePrecedente: "Anno precedente", ariaAnneeSuivante: "Anno successivo",
            ariaMenuAnnee: "Cambia anno", chargement: "Caricamento",
            titreGroupes: "Temi", sansGroupe: "Altri", ariaEvenement: "evento(i)",
            ariaOuvrirMenu: "Apri menu", ariaFermerMenu: "Chiudi menu",
            ariaMasquerGroupe: "Nascondi", ariaAfficherGroupe: "Mostra", ariaOuvrirEvent: "Apri",
            ariaBloque: "Non disponibile",
            ariaSelectionEtendue: "Selezione estesa fino al ", ariaEventDeplace: "Evento spostato dal ",
            ariaEventRedimensionne: "Evento ridimensionato dal ", ariaAu: " al ",
            choisirMois: "Mesi da nascondere", ariaMasquerMois: "Seleziona i mesi da nascondere",
            ariaMoisLectureSeul: "Mese in sola lettura",
            ariaEventMasques: "eventi aggiuntivi nascosti"
        },
        'de': { 
            aujourdhui: "Dieses Jahr", ajouter: "Hinzufügen", ceJour: "Heute",
            modifier: "Bearbeiten", supprimer: "Löschen", ariaMoisDe: "Monat",
            ariaAnneePrecedente: "Vorheriges Jahr", ariaAnneeSuivante: "Nächstes Jahr",
            ariaMenuAnnee: "Jahr ändern", chargement: "Wird geladen",
            titreGroupes: "Themen", sansGroupe: "Andere", ariaEvenement: "Ereignis(se)",
            ariaOuvrirMenu: "Menü öffnen", ariaFermerMenu: "Menü schließen",
            ariaMasquerGroupe: "Ausblenden", ariaAfficherGroupe: "Anzeigen", ariaOuvrirEvent: "Öffnen",
            ariaBloque: "Nicht verfügbar",
            ariaSelectionEtendue: "Auswahl erweitert bis ", ariaEventDeplace: "Ereignis verschoben vom ",
            ariaEventRedimensionne: "Ereignis in der Größe geändert vom ", ariaAu: " bis ",
            choisirMois: "Monate ausblenden", ariaMasquerMois: "Monate zum Ausblenden auswählen",
            ariaMoisLectureSeul: "Schreibgeschützter Monat",
            ariaEventMasques: "weitere ausgeblendete Ereignisse"
        },
        'pt': { 
            aujourdhui: "Este ano", ajouter: "Adicionar", ceJour: "Hoje",
            modifier: "Editar", supprimer: "Excluir", ariaMoisDe: "Mês de",
            ariaAnneePrecedente: "Ano anterior", ariaAnneeSuivante: "Ano seguinte",
            ariaMenuAnnee: "Mudar ano", chargement: "Carregando",
            titreGroupes: "Temas", sansGroupe: "Outros", ariaEvenement: "evento(s)",
            ariaOuvrirMenu: "Abrir menu", ariaFermerMenu: "Fechar menu",
            ariaMasquerGroupe: "Ocultar", ariaAfficherGroupe: "Mostrar", ariaOuvrirEvent: "Abrir",
            ariaBloque: "Indisponível",
            ariaSelectionEtendue: "Seleção estendida até ", ariaEventDeplace: "Evento movido de ",
            ariaEventRedimensionne: "Evento redimensionado de ", ariaAu: " para ",
            choisirMois: "Meses para ocultar", ariaMasquerMois: "Selecione os meses para ocultar",
            ariaMoisLectureSeul: "Mês somente leitura",
            ariaEventMasques: "eventos adicionais ocultos"
        }
    };
    
    constructor() { effect(() => this.dateAdapter.setLocale(this.langue())); }

    protected trad = computed(() => 
    {
        const codeLangue = this.langue().substring(0, 2).toLowerCase();
        return this.DICT_TRADUCTION[codeLangue] || this.DICT_TRADUCTION['en'];
    });

    protected AnnoncerActionVocalement(message: string): void 
    {
        this.messageAriaLive.set('');
        setTimeout(() => this.messageAriaLive.set(message), 50);
    }

    protected dateReference = computed(() => new Date(this.annee(), 0, 1));
    protected anneeTexte = computed(() => this.annee().toString());
    protected nbColonnes = computed(() => 7 - this.joursAExclure().length);

    protected listeEvenementGroupe = computed(() => 
    {
        const tousLesEvents = this.events() || [];
        const tousLesGroupes = this.groups() || [];
        const resultat: { group: any | null, events: EventCalandar[] }[] = [];

        tousLesGroupes.forEach(g => {
            const evs = tousLesEvents.filter(e => e.groupEventId === g.id);
            if (evs.length > 0) resultat.push({ group: g, events: evs });
        });

        const sansGroupe = tousLesEvents.filter(e => !e.groupEventId);
        if (sansGroupe.length > 0) resultat.push({ group: null, events: sansGroupe });

        return resultat;
    });

    protected displayEvents = computed(() => 
    {
        const apercu = this.previewResize();
        const baseEvents = this.events() ?? [];
        const masques = this.groupesMasques();
        const bloquerPasse = this.readonlyPast();
        const minuitAujourdhui = new Date().setHours(0, 0, 0, 0);

        const eventsFiltres = baseEvents.filter(ev => !masques.has(ev.groupEventId || 'sans-groupe')).map(ev => 
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

    private joursAExclure = computed(() => {
        const A_MASQUER = new Set(this.daysOfWeekDisabled());
        if (this.weekendDisabled()) { A_MASQUER.add(0); A_MASQUER.add(6); }
        return Array.from(A_MASQUER);
    });

    protected listeNomSemaine = computed(() => {
        let liste = [];
        const JOUR_DEBUT = this.mondayFirst() ? 5 : 4; 
        const DATE_REF = new Date(2025, 4, JOUR_DEBUT); 
        const longFormatter = new Intl.DateTimeFormat(this.langue(), { weekday: 'long' });
        const shortFormatter = new Intl.DateTimeFormat(this.langue(), { weekday: 'short' });

        for (let i = 0; i < 7; i++) {
            const dateTest = new Date(DATE_REF);
            dateTest.setDate(DATE_REF.getDate() + i);
            if (this.joursAExclure().includes(dateTest.getDay())) continue;
            liste.push({ long: longFormatter.format(dateTest), short: shortFormatter.format(dateTest).replace('.', '') });
        }
        return liste;
    });

    protected listeMoisAnnee = computed(() => {
        const moisData = [];
        const formatMois = new Intl.DateTimeFormat(this.langue(), { month: 'long' });

        for (let m = 1; m <= 12; m++) 
        {
            if (this.moisMasquesSet().has(m)) 
                continue;

            const estDesactive = this.monthsDisabled().includes(m);
            moisData.push({
                numero: m,
                nom: formatMois.format(new Date(this.annee(), m - 1, 1)),
                estDesactive: estDesactive,
                semaines: this.GenererMiniMois(m)
            });
        }
        return moisData;
    });

    protected listeTousLesMois = computed(() => 
    {
        const formatMois = new Intl.DateTimeFormat(this.langue(), { month: 'long' });

        return Array.from({ length: 12 }, (_, i) => ({
            numero: i + 1,
            nom: formatMois.format(new Date(this.annee(), i, 1))
        }));
    });

    ngOnInit(): void 
    {
        this.moisMasques.set(this.defaultHiddenMonths());

        if(this.sidebarConfig()?.defaultOpen === true) 
            this.panneauOuvert.set(true);

        this.onResize();
        this.VerifierTheme();

        this.themeObserver = new MutationObserver(() => this.VerifierTheme());
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    ngOnDestroy(): void 
    { 
        if (this.themeObserver) 
            this.themeObserver.disconnect(); 
    }

    protected OnMoisFilterChange(valeurs: number[]): void 
    {
        this.moisMasques.set(valeurs);
        this.AnnoncerActionVocalement(this.trad().ariaMasquerMois);
    }

    protected OnYearSelected(date: Date, datepicker: any): void 
    {
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

        if (this.darkModeActif()) {
            return { '--event-bg': group.bgColorDark || group.bgColorLight, '--event-text': group.textColorDark || group.textColorLight };
        } else {
            return { '--event-bg': group.bgColorLight, '--event-text': group.textColorLight };
        }
    }

    protected GetDayAriaLabel(jour: DateCalendrier, estLectureSeul: boolean): string 
    {
        if (!jour.estMoisCourant) 
            return '';
        
        let label = '';
        if (jour.estAujourdhui) 
            label += this.trad().ceJour + ', ';
        
        label += this.FormatDateAria(jour.date);

        if (estLectureSeul)
            label += ', ' + this.trad().ariaMoisLectureSeul;
        
        if (jour.estBloquer)
            label += ', ' + this.trad().ariaBloque;
 
        else 
        {
            if (jour.listeEvent.length > 0)
                label += ', ' + jour.listeEvent.length + ' ' + this.trad().ariaEvenement;

            if (jour.listeEventSpecial && jour.listeEventSpecial.length > 0) 
            {
                const titresSpeciaux = jour.listeEventSpecial.map(sp => sp.title).join(', ');
                label += ', ' + titresSpeciaux;
            }
        }
        
        return label;
    }

    protected OnContextMenuAction(_action: string, _event: EventCalandar): void 
    { 
        this.contextClicked.emit({
            action: _action,
            event: _event
        });
    }

    protected EstDateDebutLectureSeul(dateDebut: Date): boolean 
    {
        if (!dateDebut) 
            return false;

        return this.monthsDisabled().includes(dateDebut.getMonth() + 1);
    }

    protected EstDateFinLectureSeul(dateFin: Date): boolean 
    {
        if (!dateFin) 
            return false;

        return this.monthsDisabled().includes(dateFin.getMonth() + 1);
    }

    protected FormaterDateCourte(date: Date): string 
    { 
        if (!date) return '';
        return new Intl.DateTimeFormat(this.langue(), { day: '2-digit', month: 'short' }).format(date);
    }

    protected ClickEvent(_event: EventCalandar): void { this.eventClickEvent.emit(_event); }

    protected BtnAjouterClicker()
    {
        this.btnAddClicked.emit();
    }

    protected AnneePrecedente(): void 
    { 
        this.annee.set(this.annee() - 1); 
        this.AnnoncerActionVocalement(this.annee().toString());
    }

    protected AnneeSuivante(): void 
    { 
        this.annee.set(this.annee() + 1);
        this.AnnoncerActionVocalement(this.annee().toString());
    }

    protected AllerAujourdhui(): void 
    { 
        this.annee.set(new Date().getFullYear()); 
        this.AnnoncerActionVocalement(this.annee().toString());
    }

    protected BasculerVisibiliteGroupe(idGroupe: string | number | null): void 
    {
        const actuel = new Set(this.groupesMasques());
        const idABasculer = idGroupe === null ? 'sans-groupe' : idGroupe;

        if (actuel.has(idABasculer)) 
            actuel.delete(idABasculer);

        else 
            actuel.add(idABasculer);

        this.groupesMasques.set(actuel);
    }

    protected FormatDateAria(date: Date): string 
    {
        if (!date) 
            return '';

        const langue = this.langue() || 'fr-FR'; 
        return date.toLocaleDateString(langue, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    protected EstGroupeMasque(idGroupe: string | number | null): boolean 
    {
        return this.groupesMasques().has(idGroupe === null ? 'sans-groupe' : idGroupe);
    }

    protected ClickJour(dateCalendrier: DateCalendrier): void 
    {
        if (!dateCalendrier.estBloquer && dateCalendrier.estMoisCourant)
            this.eventClickJour.emit(dateCalendrier);
    }

    protected OnDayCellKeydown(event: KeyboardEvent, jour: DateCalendrier, estLectureSeul: boolean = false): void 
    {
        // Annuler la création
        if (event.key == 'Escape') 
        {
            if (this.dragCreationEnCours()) 
            {
                this.AnnulerCreationClavier();
                event.preventDefault();
            }

            return;
        }

        // Valider la création ou cliquer sur le jour
        if (event.key === 'Enter' || event.key === ' ') 
        {
            event.preventDefault();
            if (this.readonly() || estLectureSeul) 
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
                this.ClickJour(jour);

            return;
        }

        // 3. Navigation Rapide P / N
        if (['p', 'n'].includes(event.key.toLowerCase()) && !event.altKey && !event.metaKey && !event.shiftKey && !event.ctrlKey) 
        {
            event.preventDefault();
            event.stopPropagation();
            
            const recule = event.key.toLowerCase() === 'p';
            const nouvelleAnnee = this.annee() + (recule ? -1 : 1);
            this.annee.set(nouvelleAnnee);

            let dateCible = new Date(jour.date);
            dateCible.setFullYear(nouvelleAnnee);
            if (jour.date.getMonth() == 1 && jour.date.getDate() == 29 && dateCible.getMonth() != 1)
                dateCible = new Date(nouvelleAnnee, 1, 28);

            setTimeout(() => {
                const caseCible = this.el.nativeElement.querySelector(`.day-cell:not(.hors-mois)[data-date="${dateCible.getTime()}"]`) as HTMLElement;
                if (caseCible) 
                {
                    caseCible.focus();
                    caseCible.scrollIntoView({ behavior: 'auto', block: 'center' });
                }
            }, 120);

            return;
        }

        // 4. Navigation au clavier (flèches simples)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) 
        {
            event.preventDefault();
            let nouvelleDate = new Date(jour.date);
            nouvelleDate.setHours(0, 0, 0, 0);

            if (event.key == 'ArrowRight') 
                nouvelleDate.setDate(nouvelleDate.getDate() + 1);

            else if (event.key == 'ArrowLeft') 
                nouvelleDate.setDate(nouvelleDate.getDate() - 1);

            else if (event.key == 'ArrowDown') 
                nouvelleDate.setDate(nouvelleDate.getDate() + 7);

            else if (event.key == 'ArrowUp') 
                nouvelleDate.setDate(nouvelleDate.getDate() - 7);

            const caseCible = this.el.nativeElement.querySelector(`.day-cell:not(.hors-mois)[data-date="${nouvelleDate.getTime()}"]`) as HTMLElement;

            if (caseCible) 
            {
                caseCible.focus();
                const container = this.el.nativeElement.querySelector('.vertical-months-list');

                if (container) 
                {
                    const caseRect = caseCible.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();

                    if (caseRect.bottom > containerRect.bottom || caseRect.top < containerRect.top)
                        caseCible.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } 
            else 
            {
                if (nouvelleDate.getFullYear() != this.annee()) 
                {
                    this.annee.set(nouvelleDate.getFullYear());
                    setTimeout(() => {
                        const nouvelleCaseCible = this.el.nativeElement.querySelector(`.day-cell:not(.hors-mois)[data-date="${nouvelleDate.getTime()}"]`) as HTMLElement;
                        if (nouvelleCaseCible) 
                        {
                            nouvelleCaseCible.focus();
                            nouvelleCaseCible.scrollIntoView({ behavior: 'auto', block: 'center' });
                        }
                    }, 100);
                }
            }
        }

        // Création au clavier (Shift + Flèches)
        if (event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) 
        {
            event.preventDefault();

            if (this.readonly() || estLectureSeul) 
                return;

            if (jour.estBloquer && !this.dragCreationEnCours()) 
                return;

            if (!this.dragCreationEnCours()) 
            {
                this.dragCreationEnCours.set(true);
                this.dateDebutCreation.set(jour.date);
                this.dateFinCreation.set(jour.date);
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

            const dateActuelle = this.dateFinCreation() || jour.date;
            const nouvelleDateFin = new Date(dateActuelle);
            nouvelleDateFin.setDate(nouvelleDateFin.getDate() + decalage);

            if (this.readonlyPast() && nouvelleDateFin.getTime() < new Date().setHours(0, 0, 0, 0))
                nouvelleDateFin.setTime(new Date().setHours(0, 0, 0, 0));

            this.dateFinCreation.set(nouvelleDateFin);

            if (nouvelleDateFin.getFullYear() !== this.annee())
                this.annee.set(nouvelleDateFin.getFullYear());

            this.AnnoncerActionVocalement(this.trad().ariaSelectionEtendue + this.FormatDateAria(nouvelleDateFin));

            setTimeout(() => {
                const targetCell = this.el.nativeElement.querySelector(`.day-cell:not(.hors-mois)[data-date="${nouvelleDateFin.getTime()}"]`) as HTMLElement;
                if (targetCell) 
                {
                    targetCell.focus();
                    const container = this.el.nativeElement.querySelector('.vertical-months-list');
                    if (container) 
                    {
                        const caseRect = targetCell.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();

                        if (caseRect.bottom > containerRect.bottom || caseRect.top < containerRect.top)
                            targetCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }, 50);
        }

        // Focus sur les événements (Alt + Flèche Bas)
        if (event.altKey && event.key === 'ArrowDown') 
        {
            event.preventDefault();
            if (jour.listeEvent && jour.listeEvent.length > 0) 
            {
                this.dateRetourFocus.set(jour.date.getTime());
                const eventsTries = [...jour.listeEvent].sort((a, b) => {
                    const startDiff = a.startDate.getTime() - b.startDate.getTime();

                    if (startDiff !== 0) 
                        return startDiff;

                    return (b.endDate.getTime() - b.startDate.getTime()) - (a.endDate.getTime() - a.startDate.getTime());
                });

                this.listeEventIdsFocus.set(eventsTries.map(e => e.id));
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
            this.previewResize.set(null);
    }

    protected OnEventKeydown(_event: KeyboardEvent, _eventObj: EventCalandar): void 
    {
        if (_event.key == 'Escape') 
        {
            if (this.previewResize()) {
                this.previewResize.set(null);
                _event.preventDefault();
                _event.stopPropagation();
            }
            return;
        }

        // Saut rapide d'année (Touches P et N)
        if (['p', 'n'].includes(_event.key.toLowerCase()) && !_event.ctrlKey && !_event.metaKey && !_event.altKey) {
            _event.preventDefault();
            _event.stopPropagation();

            let nouvelleDate = new Date(_eventObj.startDate);
            const recule = _event.key.toLowerCase() === 'p';
            const nouvelleAnnee = this.annee() + (recule ? -1 : 1);
            this.annee.set(nouvelleAnnee);

            let dateCible = new Date(nouvelleDate);
            dateCible.setFullYear(nouvelleAnnee);
            if (nouvelleDate.getMonth() == 1 && nouvelleDate.getDate() == 29 && dateCible.getMonth() != 1) {
                dateCible = new Date(nouvelleAnnee, 1, 28);
            }

            setTimeout(() => {
                const eventElement = this.el.nativeElement.querySelector(`#event-${_eventObj.id}`) as HTMLElement;
                if (eventElement) eventElement.focus();
                else {
                    const caseJour = this.el.nativeElement.querySelector(`.day-cell:not(.hors-mois)[data-date="${dateCible.getTime()}"]`) as HTMLElement;
                    if (caseJour) caseJour.focus();
                }
            }, 120);
            return;
        }

        if (_event.key == 'Enter' || _event.key == ' ') {
            _event.preventDefault();
            _event.stopPropagation();
            const apercu = this.previewResize();
            if (apercu && apercu.eventId === _eventObj.id) {
                this.eventUpdated.emit({
                    id: _eventObj.id, titre: _eventObj.titre, groupEventId: _eventObj.groupEventId,
                    description: _eventObj.description, readonly: _eventObj.readonly,
                    startDate: apercu.startDate, endDate: apercu.endDate
                });
                this.previewResize.set(null);
            } else {
                this.ClickEvent(_eventObj);
            }
            return;
        }

        // Remonter sur la case d'origine (Alt + Flèche Haut)
        if (_event.altKey && _event.key === 'ArrowUp') {
            _event.preventDefault();
            const timestamp = this.dateRetourFocus() || new Date(_eventObj.startDate.getFullYear(), _eventObj.startDate.getMonth(), _eventObj.startDate.getDate()).getTime();
            const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
            if (caseJour) caseJour.focus();
            return;
        }

       // Échappement avec la touche TAB
        if (_event.key == 'Tab') 
        {
            const idsDuJour = this.listeEventIdsFocus();
            const indexActuel = idsDuJour.indexOf(_eventObj.id);

            // Si on navigue bien dans les événements d'un jour précis (Alt + Flèche Bas)
            if (idsDuJour.length > 0 && indexActuel !== -1) 
            {
                _event.preventDefault();
                const weekRow = (_event.target as HTMLElement).closest('.week-row');
                
                if (!_event.shiftKey) 
                {
                    // TAB -> Descendre dans la liste
                    if (indexActuel < idsDuJour.length - 1) {
                        const idSuivant = idsDuJour[indexActuel + 1];
                        if (weekRow) {
                            const nextEl = weekRow.querySelector(`#event-${idSuivant}`) as HTMLElement;
                            if (nextEl) nextEl.focus();
                        }
                    } 
                    else 
                    {
                        // Fin de liste -> Retour à la case du jour
                        const timestamp = this.dateRetourFocus();
                        if (timestamp) 
                        {
                            const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
                            if (caseJour) 
                                caseJour.focus();
                        }
                    }
                } 
                else 
                {
                    // SHIFT + TAB -> Remonter dans la liste
                    if (indexActuel > 0) 
                    {
                        const idPrecedent = idsDuJour[indexActuel - 1];
                        if (weekRow) 
                        {
                            const prevEl = weekRow.querySelector(`#event-${idPrecedent}`) as HTMLElement;
                            if (prevEl) 
                                prevEl.focus();
                        }
                    } 
                    else 
                    {
                        // Début de liste -> Retour à la case du jour
                        const timestamp = this.dateRetourFocus();
                        if (timestamp) 
                        {
                            const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
                            if (caseJour) 
                                caseJour.focus();
                        }
                    }
                }
            } 
            // Fallback classique (au cas où on clique sur un event avec la souris puis on fait TAB)
            else 
            {
                const cible = _event.target as HTMLElement;
                const coucheEvenements = cible.closest('.events-foreground-layer');
                if (coucheEvenements) 
                {
                    const tousLesEvenements = Array.from(coucheEvenements.querySelectorAll('.absolute-event')) as HTMLElement[];
                    const indexActuel = tousLesEvenements.indexOf(cible);
                    
                    if (!_event.shiftKey && indexActuel == tousLesEvenements.length - 1) 
                    {
                        _event.preventDefault(); 
                        const timestamp = this.dateRetourFocus() || new Date(_eventObj.startDate.getFullYear(), _eventObj.startDate.getMonth(), _eventObj.startDate.getDate()).getTime();
                        const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
                        if (caseJour) 
                            caseJour.focus();
                    } 
                    else if (_event.shiftKey && indexActuel == 0) 
                    {
                        _event.preventDefault();
                        const timestamp = this.dateRetourFocus() || new Date(_eventObj.startDate.getFullYear(), _eventObj.startDate.getMonth(), _eventObj.startDate.getDate()).getTime();
                        const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
                        if (caseJour) 
                            caseJour.focus();
                    }
                }
            }

            return;
        }

        // Déplacement et Redimensionnement au clavier
        let estEnDeplacement = _event.shiftKey && !_event.ctrlKey && !_event.metaKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(_event.key);
        let estRedimensionnementFin = (_event.ctrlKey || _event.metaKey) && !_event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(_event.key);
        let estRedimensionnementDebut = (_event.ctrlKey || _event.metaKey) && _event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(_event.key);

        if (estEnDeplacement && (this.EstDateDebutLectureSeul(_eventObj.startDate) || this.EstDateFinLectureSeul(_eventObj.endDate)))
            return;
        
        if (estRedimensionnementDebut && this.EstDateDebutLectureSeul(_eventObj.startDate))
            return;
        
        if (estRedimensionnementFin && this.EstDateFinLectureSeul(_eventObj.endDate))
            return;

        if (estEnDeplacement || estRedimensionnementFin || estRedimensionnementDebut) 
        {
            _event.preventDefault();
            _event.stopPropagation();
            if (this.readonly() || _eventObj.readonly) return;

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

            if (estEnDeplacement) {
                nouveauDebut.setDate(nouveauDebut.getDate() + decalage);
                nouvelleFin.setDate(nouvelleFin.getDate() + decalage);
            } else if (estRedimensionnementFin) {
                let testFin = new Date(nouvelleFin);
                testFin.setDate(testFin.getDate() + decalage);
                if (testFin.getTime() >= nouveauDebut.getTime()) nouvelleFin = testFin;
            } else if (estRedimensionnementDebut) {
                let testDebut = new Date(nouveauDebut);
                testDebut.setDate(testDebut.getDate() + decalage);
                if (testDebut.getTime() <= nouvelleFin.getTime()) nouveauDebut = testDebut;
            }

            this.previewResize.set({ eventId: _eventObj.id, startDate: nouveauDebut, endDate: nouvelleFin });

            const typeAction = estEnDeplacement ? this.trad().ariaEventDeplace : this.trad().ariaEventRedimensionne;
            this.AnnoncerActionVocalement(`${typeAction}${this.FormatDateAria(nouveauDebut)}${this.trad().ariaAu}${this.FormatDateAria(nouvelleFin)}`);

            const dateCible = estRedimensionnementDebut ? nouveauDebut : nouvelleFin;
            if (dateCible.getFullYear() !== this.annee())
                this.annee.set(dateCible.getFullYear());

            this.focusTimeout = setTimeout(() => {
                const elementsEvenement = this.el.nativeElement.querySelectorAll(`#event-${_eventObj.id}`);

                if (elementsEvenement.length > 0) 
                {
                    if (estRedimensionnementFin || (estEnDeplacement && decalage > 0))
                        (elementsEvenement[elementsEvenement.length - 1] as HTMLElement).focus();

                    else
                        (elementsEvenement[0] as HTMLElement).focus();
                }
                this.ignoreBlur = false; 
            }, 120);
        }
    }

    protected OnMouseDownCreation(event: MouseEvent | TouchEvent | Event, dateJour: Date, estBloquer: boolean): void 
    {
        if (this.readonly() || estBloquer) 
            return;

        if (event.type == 'touchstart') 
            this.dernierTouchTime = Date.now();

        else if (event.type === 'mousedown' && Date.now() - this.dernierTouchTime < 500) 
            return;

        if (event instanceof MouseEvent && event.button != 0) 
            return;

        const target = event.target as HTMLElement;
        if (target.closest('.event-item') || target.closest('.special-event-indicators-container')) 
            return;

        const clientXDebut = event instanceof MouseEvent ? event.clientX : (event as TouchEvent).touches[0].clientX;
        const clientYDebut = event instanceof MouseEvent ? event.clientY : (event as TouchEvent).touches[0].clientY;

        this.dateDebutCreation.set(dateJour);
        this.dateFinCreation.set(dateJour);
        this.dragCreationEnCours.set(false);

        let aBouge = false;
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

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => {
            const moveX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            const moveY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

            if (Math.abs(moveX - clientXDebut) > 5 || Math.abs(moveY - clientYDebut) > 5) 
                aBouge = true;

            if (modeDragCreation && aBouge) 
            {
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

                if (hoveredCell && !hoveredCell.classList.contains('hors-mois') && hoveredCell.dataset['date']) 
                {
                    let timestamp = parseInt(hoveredCell.dataset['date'], 10);
                    if (!isNaN(timestamp)) {
                        if (this.readonlyPast() && timestamp < new Date().setHours(0, 0, 0, 0)) timestamp = new Date().setHours(0, 0, 0, 0);
                        this.dateFinCreation.set(new Date(timestamp));
                    }
                }
            }
        };

        const onMouseUp = () => {
            clearTimeout(timeoutAppuiLong);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            if (window.getSelection)
                window.getSelection()?.removeAllRanges();

            if (modeDragCreation && aBouge && this.dragCreationEnCours()) 
            {
                let debut = this.dateDebutCreation();
                let fin = this.dateFinCreation();

                if (debut && fin) 
                {   
                    this.eventCreated.emit({ 
                        start: new Date(Math.min(debut.getTime(), fin.getTime())), 
                        end: new Date(Math.max(debut.getTime(), fin.getTime()))
                    });
                }
            }

            this.dragCreationEnCours.set(false);
            this.dateDebutCreation.set(null);
            this.dateFinCreation.set(null);
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
    }

    protected OnMoveStart(_e: MouseEvent | TouchEvent, _eventObj: EventCalandar): void 
    {
        if (this.readonly() || _eventObj.readonly || this.EstDateDebutLectureSeul(_eventObj.startDate) || this.EstDateFinLectureSeul(_eventObj.endDate)) 
            return;

        if (_e instanceof MouseEvent && _e.button !== 0) 
            return;

        _e.preventDefault();
        _e.stopPropagation();

        let clientXDebut = _e instanceof MouseEvent ? _e.clientX : _e.touches[0].clientX;
        let clientYDebut = _e instanceof MouseEvent ? _e.clientY : _e.touches[0].clientY;

        const targetElement = (_e.target as HTMLElement).closest('.absolute-event') as HTMLElement;
        if (!targetElement) 
            return;

        const rect = targetElement.getBoundingClientRect();
        const offsetX = clientXDebut - rect.left;
        const offsetY = clientYDebut - rect.top;

        let elementsDebut = document.elementsFromPoint(clientXDebut, clientYDebut);
        let caseOrigine = elementsDebut.find(el => el.classList.contains('day-cell')) as HTMLElement | undefined;
        
        let dateOrigine: Date;

        if (caseOrigine && caseOrigine.dataset['date']) 
            dateOrigine = new Date(parseInt(caseOrigine.dataset['date'], 10));
        else 
            dateOrigine = new Date(_eventObj.startDate);

        dateOrigine.setHours(0, 0, 0, 0);

        let aBouge = false;
        let dateTrouvee = false;
        let finalStartDate = new Date(_eventObj.startDate);
        let finalEndDate = new Date(_eventObj.endDate);
        let elementFantome: HTMLElement | null = null;

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (_moveEvent.cancelable) 
                _moveEvent.preventDefault();

            let clientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            let clientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

            if (!aBouge && (Math.abs(clientX - clientXDebut) > 5 || Math.abs(clientY - clientYDebut) > 5)) 
            {
                aBouge = true;

                elementFantome = targetElement.cloneNode(true) as HTMLElement;
                elementFantome.removeAttribute('id');
                elementFantome.classList.add('event-ghost-preview'); 
                
                elementFantome.style.width = rect.width + 'px';
                elementFantome.style.height = rect.height + 'px';
                document.body.appendChild(elementFantome);
            }

            if (aBouge && elementFantome) 
            {
                // Positionnement fluide au curseur
                elementFantome.style.left = (clientX - offsetX) + 'px';
                elementFantome.style.top = (clientY - offsetY) + 'px';

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

                        this.previewResize.set({ eventId: _eventObj.id, startDate: finalStartDate, endDate: finalEndDate });
                    }
                }
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            if (window.getSelection)
                window.getSelection()?.removeAllRanges();

            if (elementFantome) 
            {
                elementFantome.remove(); 
                elementFantome = null; 
            }

            this.previewResize.set(null);

            if (aBouge && dateTrouvee && (finalStartDate.getTime() != _eventObj.startDate.getTime() || finalEndDate.getTime() != _eventObj.endDate.getTime())) 
            {
                this.eventUpdated.emit({
                    id: _eventObj.id, titre: _eventObj.titre, groupEventId: _eventObj.groupEventId,
                    description: _eventObj.description, readonly: _eventObj.readonly,
                    startDate: finalStartDate, endDate: finalEndDate
                });
            } 
            else if (!aBouge)
                this.ClickEvent(_eventObj);
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

        if (_side == 'left' && this.EstDateDebutLectureSeul(_eventObj.startDate))
            return;

        if (_side == 'right' && this.EstDateFinLectureSeul(_eventObj.endDate))
            return;

        let dateTrouvee = false;
        let finalStartDate = new Date(_eventObj.startDate);
        let finalEndDate = new Date(_eventObj.endDate);

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => {
            if (_moveEvent.cancelable) 
                _moveEvent.preventDefault(); 

            let clientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            let clientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

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

                        finalStartDate = new Date(hoveredDate);
                        finalStartDate.setHours(_eventObj.startDate.getHours(), _eventObj.startDate.getMinutes(), _eventObj.startDate.getSeconds());
                    } 
                    else 
                    {
                        if (hoveredDate.getTime() < _eventObj.startDate.getTime()) 
                            hoveredDate = new Date(_eventObj.startDate);

                        finalEndDate = new Date(hoveredDate);
                        finalEndDate.setHours(_eventObj.endDate.getHours(), _eventObj.endDate.getMinutes(), _eventObj.endDate.getSeconds());
                    }

                    this.previewResize.set({ eventId: _eventObj.id, startDate: finalStartDate, endDate: finalEndDate });
                }
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            if (window.getSelection)
                window.getSelection()?.removeAllRanges();
            
            this.previewResize.set(null);

            if (dateTrouvee && (finalStartDate.getTime() != _eventObj.startDate.getTime() || finalEndDate.getTime() != _eventObj.endDate.getTime())) 
            {
                this.eventUpdated.emit({
                    id: _eventObj.id, titre: _eventObj.titre, groupEventId: _eventObj.groupEventId,
                    description: _eventObj.description, readonly: _eventObj.readonly,
                    startDate: finalStartDate, endDate: finalEndDate
                });
            }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
    }

    protected EstEnCreation(_date: Date): boolean 
    {
        const debut = this.dateDebutCreation();
        const fin = this.dateFinCreation();

        if (!this.dragCreationEnCours() || !debut || !fin) 
            return false;

        const tDate = new Date(_date.getFullYear(), _date.getMonth(), _date.getDate()).getTime();
        const tDebut = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate()).getTime();
        const tFin = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate()).getTime();

        const min = Math.min(tDebut, tFin);
        const max = Math.max(tDebut, tFin);

        return tDate >= min && tDate <= max;
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

    private AnnulerCreationClavier(): void 
    {
        this.dragCreationEnCours.set(false);
        this.dateDebutCreation.set(null);
        this.dateFinCreation.set(null);
    }

    private GenererMiniMois(mois: number): SemaineCalendrier[] 
    {
        const _de = new Date(this.annee(), mois - 1, 1);
        const isMonthReadOnly = this.monthsDisabled().includes(mois);

        // On définit les limites exactes du vrai mois (du 1er au dernier jour)
        const debutVraiMois = new Date(this.annee(), mois - 1, 1).getTime();
        const finVraiMois = new Date(this.annee(), mois, 0, 23, 59, 59).getTime();

        const eventsDuMois = this.displayEvents().filter(ev => 
        {
            return ev.startDate.getTime() <= finVraiMois && ev.endDate.getTime() >= debutVraiMois;
        });

        const DATE_DEBUT = new Date(_de);
        let offset = DATE_DEBUT.getDay();

        if (this.mondayFirst()) 
            offset = offset === 0 ? 6 : offset - 1;

        DATE_DEBUT.setDate(DATE_DEBUT.getDate() - offset); 

        let joursPlats: InternalDateCalendrier[] = [];

        // 1. GÉNÉRATION DES 42 CASES DU MOIS
        for (let i = 0; i < 42; i++) 
        {
            let date = new Date(DATE_DEBUT);
            date.setDate(date.getDate() + i);

            if (this.joursAExclure().includes(date.getDay())) 
                continue;

            const M = date.getMonth() + 1;
            const D = date.getDate();  
            const Y = date.getFullYear();

            const estMoisCourant = (date.getMonth() === _de.getMonth()) && (date.getFullYear() === _de.getFullYear());            

            let estBloquerDatePrecise = this.daysDisabled()?.some(x => this.EstMemeJour(x, date)) ?? false;
            let estBloquerIntervalle = this.intervalsDisabled().some(inter => 
            {
                const startM = inter.start.month; const startD = inter.start.day; const startY = inter.start.year;
                const endM = inter.end.month; const endD = inter.end.day; const endY = inter.end.year;

                if (startY != undefined && startY != null && endY !== undefined && endY != null) 
                {
                    const tDate = new Date(Y, M - 1, D).getTime();
                    const tStart = new Date(startY, startM - 1, startD).getTime();
                    const tEnd = new Date(endY, endM - 1, endD).getTime();

                    return tDate >= tStart && tDate <= tEnd;
                }

                const isNormalInterval = (startM < endM) || (startM === endM && startD <= endD);
                let estDansLaPeriode = isNormalInterval ? 
                    ((M > startM || (M === startM && D >= startD)) && (M < endM || (M === endM && D <= endD))) :
                    ((M > startM || (M === startM && D >= startD)) || (M < endM || (M === endM && D <= endD)));
                
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

            let estBloquer = !estMoisCourant || estBloquerDatePrecise || estBloquerIntervalle;
            if (this.readonlyPast() && date.getTime() < new Date().setHours(0, 0, 0, 0)) 
                estBloquer = true;

            const eventsDuJour = estMoisCourant ? eventsDuMois.filter(x => this.EstDansIntervalle(date, x.startDate, x.endDate)) : [];

            // --- GESTION DES ÉVÉNEMENTS SPÉCIAUX (BADGES) ---
            const eventsSpeciauxDuJour = estMoisCourant ? this.specialEvents().filter(sp => 
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

            }) : [];

            joursPlats.push({
                date: date, 
                estBloquer: estBloquer, 
                estAujourdhui: this.EstMemeJour(date, new Date()),
                estMoisCourant: estMoisCourant, 
                estWeekend: date.getDay() == 0 || date.getDay() == 6,
                listeEvent: eventsDuJour, 
                listeEventSpecial: eventsSpeciauxDuJour,
                nbEventsMasques: 0
            });
        }

        const semaines: SemaineCalendrier[] = [];
        const nbCols = this.nbColonnes();

        // DÉCOUPAGE EN SEMAINES ET CALCUL DES BARRES
        for (let i = 0; i < joursPlats.length; i += nbCols) 
        {
            const joursSemaine: InternalDateCalendrier[] = joursPlats.slice(i, i + nbCols);
            let eventsPositionnes: EventPositionne[] = [];
            let slotsOccuppes: { [jour: number]: number[] } = {};

            const setEvents = new Set<EventCalandar>();
            joursSemaine.forEach(j => j.listeEvent.forEach(ev => setEvents.add(ev)));

            const eventsTries = Array.from(setEvents).sort((a, b) => {
                const startDiff = a.startDate.getTime() - b.startDate.getTime();

                if (startDiff != 0) 
                    return startDiff;

                return (b.endDate.getTime() - b.startDate.getTime()) - (a.endDate.getTime() - a.startDate.getTime());
            });

            eventsTries.forEach(ev => {
                
                // On cherche le premier et le dernier VRAI jour où l'événement apparaît
                let startIdx = -1;
                let endIdx = -1;
                
                for (let j = 0; j < joursSemaine.length; j++) 
                {
                    if (joursSemaine[j].listeEvent.some(e => e.id === ev.id)) 
                    {
                        if (startIdx === -1) 
                            startIdx = j;

                        endIdx = j;
                    }
                }

                // S'il apparaît bien dans cette semaine (sur des vrais jours), on trace la barre
                if (startIdx !== -1 && endIdx !== -1) 
                {
                    const duree = (endIdx - startIdx) + 1;

                    let ligne = 0;
                    let ligneLibre = false;
                    while (!ligneLibre) 
                    {
                        ligneLibre = true;

                        for (let j = startIdx; j <= endIdx; j++) 
                        {
                            if (!slotsOccuppes[j]) 
                                slotsOccuppes[j] = [];
                            
                            if (slotsOccuppes[j].includes(ligne)) 
                            { 
                                ligneLibre = false; 
                                ligne++; 
                                break; 
                            }
                        }
                    }

                    for (let j = startIdx; j <= endIdx; j++) 
                    {
                        if (!slotsOccuppes[j]) 
                            slotsOccuppes[j] = [];

                        slotsOccuppes[j].push(ligne);
                    }

                    eventsPositionnes.push({ 
                        event: isMonthReadOnly ? { ...ev, readonly: true } : ev,
                        jourDebutIndex: startIdx, 
                        dureeJours: duree, 
                        ligne: ligne 
                    });
                }
            });

            for (let j = 0; j < joursSemaine.length; j++) 
            {
                let nbMasques = 0;
                eventsPositionnes.forEach(pos => {
                    // Si l'événement traverse ce jour et qu'il est sur une ligne invisible (>= 4)
                    if (j >= pos.jourDebutIndex && j < pos.jourDebutIndex + pos.dureeJours && pos.ligne >= 4) 
                        nbMasques++;
                });
                // On ajoute dynamiquement la propriété (à ajouter aussi dans ton interface DateCalendrier si besoin)
                joursSemaine[j].nbEventsMasques = nbMasques;
            }

            semaines.push({ jours: joursSemaine, eventsPositionnes });
        }

        return semaines;
    }

    private EstDansIntervalle(_dateAChecker: Date, _debut: Date, _fin: Date): boolean 
    {
        const DATE = new Date(_dateAChecker.getFullYear(), _dateAChecker.getMonth(), _dateAChecker.getDate()).getTime();
        const DEBUT = new Date(_debut.getFullYear(), _debut.getMonth(), _debut.getDate()).getTime();
        const FIN = new Date(_fin.getFullYear(), _fin.getMonth(), _fin.getDate()).getTime();

        return DATE >= DEBUT && DATE <= FIN;
    }

    private EstMemeJour(date1: Date, date2: Date): boolean 
    {
        return date1.getDate() == date2.getDate() && date1.getMonth() == date2.getMonth() && date1.getFullYear() == date2.getFullYear();
    }

    private VerifierTheme(): void 
    {
        const config = this.themeConfig();
        const classDark = config?.darkModeClass || '';
        const classLight = config?.lightModeClass || '';
        const themeDefaut = config?.defaultTheme || 'light';
        const aClasseSombre = classDark ? (document.body.classList.contains(classDark) || document.documentElement.classList.contains(classDark)) : false;
        const aClasseClaire = classLight ? (document.body.classList.contains(classLight) || document.documentElement.classList.contains(classLight)) : false;

        if (aClasseSombre) 
            this.darkModeActif.set(true);

        else if (aClasseClaire) 
            this.darkModeActif.set(false);

        else 
            this.darkModeActif.set(themeDefaut == 'dark');
    }

    @HostListener('window:resize')
    protected onResize(): void 
    { 
        this.estPetitEcran.set(window.innerWidth <= 768); 
    }
}

import $ from 'jquery';
import {ApiClient} from '../api/client/apiClient';
import {Configuration} from '../configuration/configuration';
import {ConfigurationLoader} from '../configuration/configurationLoader';
import {Authenticator} from '../plumbing/oauth/authenticator';
import {TraceListener} from '../plumbing/oauth/trace/traceListener';
import {ErrorView} from '../views/errorView';
import {HeaderButtonsView} from '../views/headerButtonsView';
import {Router} from '../views/router';
import {TitleView} from '../views/titleView';
import {TraceView} from '../views/traceView';

/*
 * The application class
 */
class App {

    // Global objects
    private _configuration?: Configuration;
    private _authenticator?: Authenticator;
    private _apiClient?: ApiClient;
    private _router?: Router;
    private _titleView!: TitleView;
    private _headerButtonsView?: HeaderButtonsView;
    private _errorView?: ErrorView;
    private _traceView?: TraceView;
    private _traceListener?: TraceListener;

    // State flags
    private _isInitialised: boolean;
    private _mainViewLoaded: boolean;

    /*
     * Initialise state
     */
    public constructor() {

        // Configure the JQuery namespace
        (window as any).$ = $;
        this._isInitialised = false;
        this._setupCallbacks();

        // Initialise state flags
        this._isInitialised = false;
        this._mainViewLoaded = false;
    }

    /*
     * The entry point for the SPA
     */
    public async execute(): Promise<void> {

        try {
            // Start listening for hash changes
            window.onhashchange = this._onHashChange;

            // Do the initial render
            this._initialRender();

            // Do one time app initialisation
            await this._initialiseApp();

            // We must be prepared for page invocation to be an OAuth login response
            await this._handleLoginResponse();

            // Attempt to load data from the API, which may trigger a login redirect
            await this._loadMainView();

        } catch (e) {

            // Render the error view if there are problems
            this._errorView?.report(e);
        }
    }

    /*
     * Render views in their initial state
     */
    private _initialRender() {

        this._titleView = new TitleView();
        this._titleView.load();

        this._headerButtonsView = new HeaderButtonsView(this._onHome, this._onReloadData, this._onExpireToken);
        this._headerButtonsView.load();

        this._errorView = new ErrorView();
        this._errorView.load();

        this._traceView = new TraceView();
        this._traceView.load();
    }

    /*
     * Initialise the app
     */
    private async _initialiseApp(): Promise<void> {

        // Download application configuration
        this._configuration = await ConfigurationLoader.download('spa.config.json');

        // Initialise our OIDC Client wrapper and start listening for OIDC messages
        this._authenticator = new Authenticator(this._configuration!.oauth);
        this._traceListener = new TraceListener();

        // Create a client to reliably call the API
        this._apiClient = new ApiClient(this._configuration!.app.apiBaseUrl, this._authenticator);

        // Our simple router passes the API Client instance between views
        this._router = new Router(this._apiClient!, this._errorView!);

        // Update state to indicate that global objects are loaded
        this._isInitialised = true;
    }

    /*
     * Handle login responses on page load so that we have tokens and can call APIs
     * Also ask the OIDC Client library to get user info
     */
    private async _handleLoginResponse(): Promise<void> {

        await this._authenticator!.handleLoginResponse();
        this._titleView.loadUserInfo(this._authenticator!)
    }

    /*
     * Load API data for the main view and update UI controls
     */
    private async _loadMainView(): Promise<void> {

        try {

            // Call the API and provide a loading UI effect
            this._headerButtonsView!.disableSessionButtons();
            await this._router!.loadView();
            this._headerButtonsView!.enableSessionButtons();

            // Update state
            this._mainViewLoaded = true;

        } catch (e) {

            // Update state and rethrow
            this._mainViewLoaded = false;
            throw e;
        }
    }

    /*
     * Change the view based on the hash URL and catch errors
     */
    private async _onHashChange(): Promise<void> {

        // Handle updates to log levels when the URL log setting is changed
        this._traceListener!.updateLogLevelIfRequired();

        try {

            // Update the main view when the hash location changes
            if (this._isInitialised) {
                await this._loadMainView();
            }

        } catch (e) {

            // Report failures
            this._errorView!.report(e);
        }
    }

    /*
     * The home button moves to the home view but also deals with error recovery
     */
    private async _onHome(): Promise<void> {

        try {

            // If we have not initialised, re-initialise the app
            if (!this._isInitialised) {
                await this._initialiseApp();
            }

            if (this._isInitialised) {

                // Move to the home view
                location.hash = '#';

                // If there are API errors, clicking home tries to reload data
                if (!this._mainViewLoaded) {
                    await this._loadMainView();
                }
            }

        } catch (e) {
            this._errorView!.report(e);
        }
    }

    /*
     * Force data reload
     */
    private async _onReloadData(): Promise<void> {

        try {
            // Try to reload data
            await this._router!.loadView();

        } catch (e) {

            // Report failures
            this._errorView!.report(e);
        }
    }

    /*
     * Force a new access token to be retrieved
     */
    private async _onExpireToken(): Promise<void> {
        await this._authenticator!.expireAccessToken();
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private _setupCallbacks(): void {
        this._initialiseApp = this._initialiseApp.bind(this);
        this._handleLoginResponse = this._handleLoginResponse.bind(this);
        this._loadMainView = this._loadMainView.bind(this);
        this._onHashChange = this._onHashChange.bind(this);
        this._onHome = this._onHome.bind(this);
        this._onReloadData = this._onReloadData.bind(this);
        this._onExpireToken = this._onExpireToken.bind(this);
   }
}

/*
 * Run the application
 */
const app = new App();
app.execute();

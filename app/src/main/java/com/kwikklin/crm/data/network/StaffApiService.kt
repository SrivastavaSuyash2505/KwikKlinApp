package com.kwikklin.crm.data.network

import com.kwikklin.crm.BuildConfig
import com.kwikklin.crm.data.crm.CrmConnectionPrefs
import com.kwikklin.crm.data.security.SecureCookieJar
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okhttp3.ResponseBody
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Url
import java.util.concurrent.TimeUnit

interface StaffApiService {

    // ─── Auth & Bootstrap ───────────────────────────────────────────────────
    @POST("staff/api/login")
    suspend fun login(@Body body: LoginRequest): Response<GenericActionResponse>

    @POST("staff/api/logout")
    suspend fun logout(): Response<GenericActionResponse>

    @POST("staff/api/password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): Response<GenericActionResponse>

    @GET("staff/api/boot")
    suspend fun boot(): Response<BootResponse>

    @GET("staff/api/today")
    suspend fun today(): Response<TodayDto>

    // ─── Work / Route / Tasks / History ─────────────────────────────────────
    @GET("staff/api/route")
    suspend fun getRoute(
        @Query("tab") tab: String = "todo",
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0
    ): Response<RouteResponse>

    @GET("staff/api/tasks")
    suspend fun getTasks(
        @Query("tab") tab: String = "mine",
        @Query("limit") limit: Int = 100,
        @Query("offset") offset: Int = 0
    ): Response<TasksResponse>

    // ─── Order Details & Status Machine ─────────────────────────────────────
    @GET("staff/api/orders/{number}")
    suspend fun getOrderDetail(@Path("number") number: String): Response<OrderDetailDto>

    @POST("staff/api/orders/{number}/picked-up")
    suspend fun markPickedUp(
        @Path("number") number: String,
        @Header("X-Idempotency-Key") idempotencyKey: String? = null
    ): Response<GenericActionResponse>

    @POST("staff/api/orders/{number}/washing")
    suspend fun startWashing(
        @Path("number") number: String,
        @Body body: StartWashingRequest = StartWashingRequest(),
        @Header("X-Idempotency-Key") idempotencyKey: String? = null
    ): Response<GenericActionResponse>

    @POST("staff/api/orders/{number}/ready")
    suspend fun markReady(
        @Path("number") number: String,
        @Header("X-Idempotency-Key") idempotencyKey: String? = null
    ): Response<GenericActionResponse>

    @POST("staff/api/orders/{number}/advance")
    suspend fun advanceOrderStage(
        @Path("number") number: String,
        @Body body: AdvanceStageRequest,
        @Header("X-Idempotency-Key") idempotencyKey: String? = null
    ): Response<GenericActionResponse>

    @POST("staff/api/orders/{number}/status")
    suspend fun updateOrderStatus(
        @Path("number") number: String,
        @Body body: StatusUpdateRequest,
        @Header("X-Idempotency-Key") idempotencyKey: String? = null
    ): Response<GenericActionResponse>

    @POST("staff/api/orders/{number}/deliver")
    suspend fun deliverOrder(
        @Path("number") number: String,
        @Body body: DeliverOrderRequest = DeliverOrderRequest(items = null),
        @Header("X-Idempotency-Key") idempotencyKey: String? = null
    ): Response<GenericActionResponse>

    @POST("staff/api/orders/{number}/not-home")
    suspend fun markNotHome(
        @Path("number") number: String,
        @Body body: NotHomeRequest,
        @Header("X-Idempotency-Key") idempotencyKey: String? = null
    ): Response<GenericActionResponse>

    // Raw replay endpoint used strictly by the offline status-only outbox worker
    @POST
    suspend fun replayRawPost(
        @Url relativePath: String,
        @Body body: RequestBody,
        @Header("X-Idempotency-Key") idempotencyKey: String
    ): Response<ResponseBody>

    // ─── Strictly Online-Only Actions (Contact, Dues, Collect, Cash, GPS) ──
    @GET("staff/api/orders/{number}/call")
    suspend fun getCustomerCallPhone(@Path("number") number: String): Response<OrderCallResponse>

    @GET("staff/api/orders/{number}/dues")
    suspend fun getOrderDues(@Path("number") number: String): Response<OrderDuesResponse>

    @POST("staff/api/orders/{number}/collect")
    suspend fun collectPayment(
        @Path("number") number: String,
        @Body body: CollectPaymentRequest
    ): Response<GenericActionResponse>

    @GET("staff/api/cash")
    suspend fun getMyCash(): Response<CashSummaryDto>

    @POST("staff/api/cash/handover")
    suspend fun submitCashHandover(@Body body: CashHandoverRequest): Response<GenericActionResponse>

    @POST("staff/api/customers/{ref}/location")
    suspend fun saveCustomerLocation(
        @Path("ref") customerRef: String,
        @Body body: SaveLocationRequest
    ): Response<GenericActionResponse>

    // ─── Tasks, Messages, Cancel Requests, Notifications, Points ────────────
    @POST("staff/api/tasks/{code}/done")
    suspend fun markTaskDone(
        @Path("code") code: String,
        @Body body: TaskDoneRequest
    ): Response<GenericActionResponse>

    @GET("staff/api/tasks/{code}/messages")
    suspend fun getTaskMessages(@Path("code") code: String): Response<TaskMessagesResponse>

    @POST("staff/api/tasks/{code}/ask")
    suspend fun sendTaskMessage(
        @Path("code") code: String,
        @Body body: TaskAskRequest
    ): Response<GenericActionResponse>

    @POST("staff/api/tasks/{code}/cancel-request")
    suspend fun requestTaskCancel(
        @Path("code") code: String,
        @Body body: TaskCancelRequestBody
    ): Response<GenericActionResponse>

    @GET("staff/api/notifications")
    suspend fun getNotifications(): Response<NotificationsResponse>

    @GET("staff/api/points")
    suspend fun getPoints(): Response<PointsDto>

    // ─── Web-Parity Billing, Rate Card, Customer Search, Receipt & Expenses ─
    @GET("staff/api/rates")
    suspend fun getRates(): Response<List<RateCardItemDto>>

    @GET("staff/api/customers/search")
    suspend fun searchCustomers(@Query("q") query: String): Response<List<CustomerSearchHitDto>>

    @GET("staff/api/customers/{ref}/rewards")
    suspend fun getCustomerRewards(@Path("ref") ref: String): Response<CustomerRewardsResponse>

    @GET("staff/api/customers/{ref}/usual-items")
    suspend fun getCustomerUsualItems(@Path("ref") ref: String): Response<UsualItemsResponse>

    @GET("staff/api/tasks/{code}/bill-context")
    suspend fun getPickupBillContext(@Path("code") code: String): Response<PickupBillContextDto>

    @POST("staff/api/bills")
    suspend fun createBill(@Body body: CreateBillRequest): Response<CreateBillResponse>

    @GET("staff/api/bills")
    suspend fun getBills(
        @Query("q") query: String? = null,
        @Query("pay") pay: String? = null,
        @Query("mine") mine: Int? = null,
        @Query("limit") limit: Int = 30,
        @Query("offset") offset: Int = 0
    ): Response<BillsListResponse>

    @GET("staff/api/orders/{number}/receipt")
    suspend fun getOrderReceipt(@Path("number") number: String): Response<OrderReceiptDto>

    @GET("staff/api/expenses")
    suspend fun getExpenses(): Response<ExpensesResponse>

    @POST("staff/api/expenses")
    suspend fun createExpense(@Body body: CreateExpenseRequest): Response<GenericActionResponse>
}

object StaffApiClientFactory {
    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
    }

    fun create(
        connectionPrefs: CrmConnectionPrefs,
        cookieJar: SecureCookieJar
    ): StaffApiService {
        val dynamicBaseUrlInterceptor = Interceptor { chain ->
            val original = chain.request()
            val targetBase = connectionPrefs.getBaseUrl().toHttpUrlOrNull()
            if (targetBase != null) {
                val rebuiltUrl = original.url.newBuilder()
                    .scheme(targetBase.scheme)
                    .host(targetBase.host)
                    .port(targetBase.port)
                    .build()
                val updated = original.newBuilder()
                    .url(rebuiltUrl)
                    .header("Accept", "application/json")
                    .header("X-KwikKlin-Client", "android-native/${BuildConfig.VERSION_NAME}")
                    .build()
                chain.proceed(updated)
            } else {
                chain.proceed(original)
            }
        }

        val okHttpBuilder = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(dynamicBaseUrlInterceptor)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)

        if (BuildConfig.DEBUG) {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
                redactHeader("Cookie")
                redactHeader("Set-Cookie")
                redactHeader("Authorization")
            }
            okHttpBuilder.addInterceptor(logging)
        }

        val retrofit = Retrofit.Builder()
            .baseUrl("https://kwikklin.online/")
            .client(okHttpBuilder.build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()

        return retrofit.create(StaffApiService::class.java)
    }
}

<?php

declare(strict_types=1);

namespace app\models;

use Yii;
use yii\web\IdentityInterface;

/**
 * @property int $id
 * @property string $username
 * @property string $password_hash
 * @property string $full_name
 * @property string|null $email
 * @property int $role_id
 * @property bool $is_active
 * @property string|\yii\db\Expression|null $last_login_at
 * @property string $created_at
 * @property string $updated_at
 * @property-read Role $role
 * @property-read MedicalStaff|null $medicalStaff
 */
class User extends BaseModel implements IdentityInterface
{
    public const SCENARIO_CREATE = 'create';

    /** password plaintext dari request (tidak disimpan) */
    public ?string $password = null;

    /** @var string[]|null cache permission per request */
    private ?array $permissionCodes = null;

    public static function tableName(): string
    {
        return 'users';
    }

    protected static function label(): string
    {
        return 'Pengguna';
    }

    protected static function casts(): array
    {
        return ['role_id' => 'int', 'is_active' => 'bool'];
    }

    public function rules(): array
    {
        return [
            [['username', 'full_name'], 'trim'],
            ['username', 'filter', 'filter' => 'strtolower'],
            [['username', 'full_name', 'role_id'], 'required'],
            ['password', 'required', 'on' => self::SCENARIO_CREATE],
            ['username', 'match', 'pattern' => '/^[a-z0-9_.]{3,32}$/i',
                'message' => 'Username 3-32 karakter: huruf, angka, titik, garis bawah'],
            ['username', 'unique', 'targetClass' => self::class, 'message' => 'Username sudah dipakai'],
            ['password', 'string', 'min' => 8],
            ['full_name', 'string', 'max' => 150],
            ['email', 'email'],
            ['role_id', 'exist', 'targetClass' => Role::class, 'targetAttribute' => 'id'],
            ['is_active', 'boolean'],
        ];
    }

    public function scenarios(): array
    {
        $s = parent::scenarios();
        $s[self::SCENARIO_CREATE] = $s[self::SCENARIO_DEFAULT];
        return $s;
    }

    public function beforeSave($insert): bool
    {
        if ($this->password !== null && $this->password !== '') {
            $this->password_hash = Yii::$app->security->generatePasswordHash($this->password);
        }
        return parent::beforeSave($insert);
    }

    public function fields(): array
    {
        $fields = parent::fields();
        unset($fields['password_hash']);
        $fields['role'] = fn () => $this->role->code;
        return $fields;
    }

    public function getRole()
    {
        return $this->hasOne(Role::class, ['id' => 'role_id']);
    }

    public function getMedicalStaff()
    {
        return $this->hasOne(MedicalStaff::class, ['user_id' => 'id']);
    }

    public static function findActive(int $id): ?self
    {
        return self::findOne(['id' => $id, 'is_active' => true]);
    }

    public static function findByUsername(string $username): ?self
    {
        return self::find()->where(['lower(username)' => strtolower($username)])->one();
    }

    public function validatePassword(string $password): bool
    {
        return Yii::$app->security->validatePassword($password, $this->password_hash);
    }

    /** @return string[] */
    public function permissionCodes(): array
    {
        return $this->permissionCodes ??= (new \yii\db\Query())
            ->select('p.code')
            ->from(['p' => 'permissions'])
            ->innerJoin(['rp' => 'role_permissions'], 'rp.permission_id = p.id')
            ->where(['rp.role_id' => $this->role_id])
            ->orderBy('p.code')
            ->column();
    }

    public function can(string $permission): bool
    {
        return in_array($permission, $this->permissionCodes(), true);
    }

    /** Dokter yang login, untuk membatasi akses ke pasiennya sendiri. */
    public function doctorStaffId(): ?int
    {
        $staff = $this->medicalStaff;
        return $staff !== null && $staff->staff_type === 'doctor' ? (int) $staff->id : null;
    }

    // ---- IdentityInterface (stateless: tanpa session/cookie) ----

    public static function findIdentity($id): ?self
    {
        return self::findActive((int) $id);
    }

    public static function findIdentityByAccessToken($token, $type = null): ?self
    {
        return null; // autentikasi lewat app\components\JwtAuth
    }

    public function getId(): int
    {
        return (int) $this->id;
    }

    public function getAuthKey(): ?string
    {
        return null;
    }

    public function validateAuthKey($authKey): bool
    {
        return false;
    }
}
